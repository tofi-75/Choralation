"""RLS-scoped Supabase Storage REST access using publishable keys and user JWTs.

Never use a project secret/service-role key here: it would bypass the separate
writer, restore-reader and retention policies. Responses and credentials stay out
of exception messages. Binary downloads are never transparently decompressed.
"""

import base64
import http.client
import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime
from urllib.parse import quote, urlencode

from .core import OpsError, http_json, required

PAGE_SIZE = 1000
RETRYABLE = {408, 429, 500, 502, 503, 504}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        # Never forward the API key or a user JWT to a redirected destination.
        return None


class Store:
    def __init__(self, prefix, *, allow_delete=False):
        self.project = required(f"{prefix}_PROJECT_REF")
        if not re.fullmatch(r"[a-z0-9]+", self.project):
            raise OpsError("Invalid Supabase project reference.")
        self.bucket = required(f"{prefix}_BUCKET")
        if not re.fullmatch(r"[A-Za-z0-9_-]+", self.bucket):
            raise OpsError("Invalid Supabase bucket name.")
        self.key = required(f"{prefix}_PUBLISHABLE_KEY")
        if not re.fullmatch(r"sb_publishable_[A-Za-z0-9_-]+", self.key):
            raise OpsError(f"{prefix}_PUBLISHABLE_KEY must be a Supabase publishable key.")
        self.email = required(f"{prefix}_EMAIL")
        self.password = required(f"{prefix}_PASSWORD")
        self.allow_delete = allow_delete
        self.origin = f"https://{self.project}.supabase.co"
        self.opener = urllib.request.build_opener(NoRedirect)
        self.token = ""
        self.expires_at = 0.0

    def authenticate(self):
        # Reauthenticate privately when the short-lived token expires; no session
        # file or refresh token is persisted on the runner.
        data = http_json(
            self.origin + "/auth/v1/token?grant_type=password",
            method="POST",
            headers={"apikey": self.key},
            body={"email": self.email, "password": self.password},
        )
        try:
            lifetime = int(data["expires_in"])
            token = data["access_token"]
            if (
                lifetime <= 0
                or not isinstance(token, str)
                or not token
                or any(c in token for c in "\r\n")
            ):
                raise ValueError
        except (KeyError, TypeError, ValueError):
            raise OpsError("Storage authentication returned an invalid session.") from None
        self.token = token
        self.expires_at = time.monotonic() + lifetime - min(60, lifetime / 2)

    def request(self, path, *, method="GET", body=None, headers=None, missing=False, safe=True):
        """Retry reads only. Ambiguous writes fail without a blind resubmission."""
        refreshed = False
        for attempt in range(3):
            if not self.token or time.monotonic() >= self.expires_at:
                self.authenticate()
            request = urllib.request.Request(
                self.origin + "/storage/v1/" + path,
                data=body,
                method=method,
                headers={
                    "apikey": self.key,
                    "Authorization": f"Bearer {self.token}",
                    "Accept-Encoding": "identity",
                    **(headers or {}),
                },
            )
            try:
                with self.opener.open(request, timeout=90) as response:
                    data = response.read()
                    length = response.headers.get("Content-Length")
                    if length is not None and len(data) != int(length):
                        raise http.client.IncompleteRead(data)
                    return data
            except urllib.error.HTTPError as error:
                status = error.code
                try:
                    details = json.loads(error.read(8192))
                except (OSError, http.client.HTTPException, ValueError):
                    details = {}
                finally:
                    error.close()
                # Older Storage versions return HTTP 400 with the actual 404
                # in the JSON body. Never treat a generic 400/403 as absence.
                absent = status == 404 or (
                    status == 400
                    and isinstance(details, dict)
                    and (
                        details.get("code") == "NoSuchKey"
                        or str(details.get("statusCode")) == "404"
                    )
                )
                if missing and absent:
                    return None
                if status == 401 and not refreshed and attempt < 2:
                    self.token = ""
                    refreshed = True
                    continue
                if not safe or status not in RETRYABLE or attempt == 2:
                    raise OpsError(
                        f"Private storage request failed ({status}); provider details suppressed."
                    ) from None
            except (OSError, http.client.HTTPException):
                if not safe or attempt == 2:
                    raise OpsError(
                        "Private storage connection failed; details suppressed."
                    ) from None
            except (ValueError, TypeError):
                raise OpsError("Private storage returned an invalid response.") from None
            time.sleep(0.5 * (attempt + 1))
        raise OpsError("Private storage request failed safely.")

    def json(self, path, *, payload=None, **options):
        headers = {"Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        data = self.request(
            path,
            body=json.dumps(payload).encode() if payload is not None else None,
            headers=headers,
            **options,
        )
        if data is None:
            return None
        try:
            return json.loads(data)
        except (ValueError, TypeError):
            raise OpsError("Private storage returned invalid JSON.") from None

    def object_path(self, key):
        if (
            not isinstance(key, str)
            or not key
            or any(part in {"", ".", ".."} for part in key.split("/"))
        ):
            raise OpsError("Invalid storage object key.")
        return f"{self.bucket}/{quote(key, safe='/')}"

    def objects(self, prefix=""):
        # list-v2 without a delimiter returns full keys across all directories,
        # including empty-folder marker objects. Exhaust opaque cursors instead
        # of treating the first page or a folder-only result as the whole bucket.
        cursor, cursors, result, keys = None, set(), [], set()
        while True:
            payload = {
                "prefix": prefix,
                "limit": PAGE_SIZE,
                "with_delimiter": False,
                "sortBy": {"column": "name", "order": "asc"},
            }
            if cursor:
                payload["cursor"] = cursor
            page = self.json(f"object/list-v2/{self.bucket}", method="POST", payload=payload)
            if (
                not isinstance(page, dict)
                or not isinstance(page.get("objects"), list)
                or page.get("folders") != []
                or not isinstance(page.get("hasNext"), bool)
            ):
                raise OpsError("Private storage returned an invalid flat listing.")
            for row in page["objects"]:
                try:
                    key = row["name"]
                    self.object_path(key)
                    size = int(row["metadata"]["size"])
                    stamp = datetime.fromisoformat(row["updated_at"].replace("Z", "+00:00"))
                    if (
                        size < 0
                        or stamp.tzinfo is None
                        or key in keys
                        or not key.startswith(prefix)
                    ):
                        raise ValueError
                except (KeyError, TypeError, AttributeError, ValueError):
                    raise OpsError("Private storage returned incomplete object metadata.") from None
                keys.add(key)
                result.append({"Key": key, "Size": size, "LastModified": stamp})
            if not page["hasNext"]:
                break
            if not page["objects"]:
                raise OpsError("Private storage returned an empty nonterminal page.")
            cursor = page.get("nextCursor")
            if not isinstance(cursor, str) or not cursor or cursor in cursors:
                raise OpsError("Private storage returned an invalid pagination cursor.")
            cursors.add(cursor)
        return sorted(result, key=lambda row: row["Key"])

    def head(self, key):
        info = self.json("object/info/authenticated/" + self.object_path(key), missing=True)
        if info is not None and (
            not isinstance(info, dict)
            or info.get("name") != key
            or info.get("bucket_id") != self.bucket
        ):
            raise OpsError("Private storage returned mismatched object information.")
        return info

    def get(self, key):
        info = self.head(key)
        if info is None:
            raise OpsError("Private storage object is missing; snapshot is incomplete.")
        query = "?" + urlencode({"versionId": info["version"]}) if info.get("version") else ""
        encoding = info.get("content_encoding") or ""
        data = self.request(
            "object/authenticated/" + self.object_path(key) + query,
            # urllib returns raw bytes. Advertise stored gzip support so a CDN
            # does not decode an already-compressed source attachment for us.
            headers={"Accept-Encoding": encoding or "identity"},
        )
        try:
            if len(data) != int(info["size"]):
                raise ValueError
            metadata = info.get("metadata") or {}
            if not isinstance(metadata, dict):
                raise ValueError
        except (KeyError, TypeError, ValueError):
            raise OpsError("Storage returned an incomplete object or metadata.") from None
        return data, {
            "content_type": info.get("content_type") or "application/octet-stream",
            "content_encoding": encoding,
            "metadata": metadata,
        }

    def put(self, key, data, metadata=None):
        self.request(
            "object/" + self.object_path(key),
            method="POST",
            body=data,
            headers={
                "Content-Type": "application/octet-stream",
                "x-upsert": "false",
                "x-metadata": base64.b64encode(json.dumps(metadata or {}).encode()).decode(),
            },
            safe=False,
        )

    def delete(self, key):
        if not self.allow_delete:
            raise OpsError("This storage client cannot delete objects.")
        self.object_path(key)
        self.json(
            "object/" + self.bucket,
            method="DELETE",
            payload={"prefixes": [key]},
            safe=False,
        )
        # RLS can silently omit unauthorized rows from bulk deletion. A 200 is
        # insufficient: the pruner must prove that the exact object is absent.
        if self.head(key) is not None:
            raise OpsError("Retention deletion was not applied; check the pruner's permissions.")
