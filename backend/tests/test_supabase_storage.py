"""Supabase REST contract tests: publishable keys, scoped users and exact bytes.

Fixtures follow Supabase's list-v2, object/info, binary upload and delete routes.
No provider credentials are used. Real hosted RLS acceptance remains a rollout
check; the local fixture enforces the intended roles to exercise client behavior.
"""

import base64
import gzip
import io
import json
import threading
import time
import urllib.error
import urllib.request
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from types import SimpleNamespace
from urllib.parse import parse_qs, unquote, urlsplit

import pytest
from ops.core import OpsError
from ops.storage import Store


class Response(io.BytesIO):
    def __init__(self, data, headers=None):
        super().__init__(data)
        self.headers = {"Content-Length": str(len(data)), **(headers or {})}


class StorageAPI:
    def __init__(self, monkeypatch):
        self.monkeypatch = monkeypatch
        self.rows = {}
        self.requests = []
        self.tokens = {}
        self.logins = 0
        self.fault = None
        self.http_origin = None
        self.original_opener = urllib.request.build_opener
        monkeypatch.setattr("urllib.request.build_opener", self.build_opener)
        monkeypatch.setattr(
            "ops.supabase.time", SimpleNamespace(monotonic=time.monotonic, sleep=lambda _: None)
        )

    def build_opener(self, *handlers):
        if not self.http_origin:
            return self
        api, original = self, self.original_opener(*handlers)

        class ForwardToLocalFixture:
            def open(self, request, timeout):
                parsed = urlsplit(request.full_url)
                forwarded = urllib.request.Request(
                    api.http_origin + parsed.path + ("?" + parsed.query if parsed.query else ""),
                    data=request.data,
                    method=request.method,
                    headers={
                        **dict(request.header_items()),
                        "X-Test-Project": parsed.hostname.split(".")[0],
                    },
                )
                return original.open(forwarded, timeout=timeout)

        return ForwardToLocalFixture()

    def seed(self, project, bucket, key, data, *, encoding="", metadata=None):
        self.rows[project, bucket, key] = {
            "data": data,
            "encoding": encoding,
            "metadata": metadata or {},
            "mime": "application/pdf",
            "modified": datetime.now(UTC).isoformat(),
            "version": f"version-{len(self.rows)}",
        }

    def store(self, role="writer", *, source=False, allow_delete=False):
        prefix = "SOURCE" if source else "BACKUP"
        for suffix, value in {
            "PROJECT_REF": "source1" if source else "backup1",
            "BUCKET": "sheet-music" if source else "choralation-backups",
            "PUBLISHABLE_KEY": "sb_publishable_fictional",
            "EMAIL": role + "@example.test",
            "PASSWORD": "fictional-password",
        }.items():
            self.monkeypatch.setenv(prefix + "_" + suffix, value)
        return Store(prefix, allow_delete=allow_delete)

    def fail(self, request, status, body):
        raise urllib.error.HTTPError(
            request.full_url,
            status,
            "Private provider details",
            {},
            io.BytesIO(json.dumps(body).encode()),
        )

    def open(self, request, timeout):
        self.requests.append(request)
        if self.fault:
            result = self.fault(request)
            if result is not None:
                return result
        parsed = urlsplit(request.full_url)
        project = parsed.hostname.split(".")[0]
        headers = {key.lower(): value for key, value in request.header_items()}
        assert headers["apikey"] == "sb_publishable_fictional"
        if parsed.path == "/auth/v1/token":
            assert "authorization" not in headers  # publishable keys are not bearer JWTs
            assert parse_qs(parsed.query) == {"grant_type": ["password"]}
            login = json.loads(request.data)
            assert login["password"] == "fictional-password"
            role = login["email"].split("@")[0]
            self.logins += 1
            token = f"session-{self.logins}"
            self.tokens[token] = project, role
            return Response(json.dumps({"access_token": token, "expires_in": 3600}).encode())
        identity = self.tokens.get(headers.get("authorization", "").removeprefix("Bearer "))
        if not identity or identity[0] != project:
            self.fail(request, 401, {"code": "InvalidJWT"})
        role = identity[1]
        path = parsed.path.removeprefix("/storage/v1/object/")
        if path.startswith("list-v2/"):
            bucket = path.removeprefix("list-v2/")
            allowed_bucket = "sheet-music" if project == "source1" else "choralation-backups"
            if bucket != allowed_bucket:
                self.fail(request, 403, {"code": "AccessDenied"})
            options = json.loads(request.data)
            assert options["with_delimiter"] is False
            assert options["sortBy"] == {"column": "name", "order": "asc"}
            visible = sorted(
                (key, row)
                for (proj, buck, key), row in self.rows.items()
                if proj == project and buck == bucket and key.startswith(options["prefix"])
            )
            start = int(options.get("cursor", "0"))
            limit = options["limit"]
            selected = visible[start : start + limit]
            has_next = start + len(selected) < len(visible)
            return Response(
                json.dumps(
                    {
                        "objects": [
                            {
                                "id": "object-id",
                                "name": key,
                                "metadata": {"size": len(row["data"])},
                                "updated_at": row["modified"],
                            }
                            for key, row in selected
                        ],
                        "folders": [],
                        "hasNext": has_next,
                        "nextCursor": str(start + len(selected)) if has_next else None,
                    }
                ).encode()
            )
        info = path.startswith("info/authenticated/")
        path = path.removeprefix("info/authenticated/").removeprefix("authenticated/")
        bucket, _, encoded_key = path.partition("/")
        allowed_bucket = "sheet-music" if project == "source1" else "choralation-backups"
        if bucket != allowed_bucket:
            self.fail(request, 403, {"code": "AccessDenied"})
        key = unquote(encoded_key)
        row = self.rows.get((project, bucket, key))
        if request.method == "DELETE":
            assert set(json.loads(request.data)) == {"prefixes"}
            deleted = []
            if role == "pruner" and project == "backup1":
                for target in json.loads(request.data)["prefixes"]:
                    if self.rows.pop((project, bucket, target), None):
                        deleted.append({"name": target})
            return Response(json.dumps(deleted).encode())
        if request.method == "POST":
            if role != "writer" or project != "backup1":
                self.fail(request, 403, {"code": "AccessDenied"})
            assert headers["x-upsert"] == "false"
            if row is not None:
                self.fail(request, 409, {"code": "KeyAlreadyExists"})
            metadata = json.loads(base64.b64decode(headers["x-metadata"]))
            self.seed(project, bucket, key, request.data, metadata=metadata)
            self.rows[project, bucket, key]["mime"] = headers["content-type"]
            return Response(json.dumps({"Key": bucket + "/" + key}).encode())
        if row is None:
            self.fail(request, 404, {"code": "NoSuchKey"})
        if info:
            return Response(
                json.dumps(
                    {
                        "name": key,
                        "bucket_id": bucket,
                        "size": len(row["data"]),
                        "version": row["version"],
                        "content_type": row["mime"],
                        "content_encoding": row["encoding"],
                        "metadata": row["metadata"],
                    }
                ).encode()
            )
        assert parse_qs(parsed.query).get("versionId") == [row["version"]]
        assert headers["accept-encoding"] == (row["encoding"] or "identity")
        return Response(row["data"], {"Content-Encoding": row["encoding"]})

    @contextmanager
    def over_http(self):
        api = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                headers = dict(self.headers)
                project = headers.pop("X-Test-Project")
                request = urllib.request.Request(
                    f"https://{project}.supabase.co{self.path}",
                    data=self.rfile.read(int(self.headers.get("Content-Length", 0))) or None,
                    method=self.command,
                    headers=headers,
                )
                try:
                    response = api.open(request, timeout=10)
                    status, body, response_headers = 200, response.read(), response.headers
                except urllib.error.HTTPError as error:
                    status, body, response_headers = error.code, error.read(), error.headers
                self.send_response(status)
                for key, value in response_headers.items():
                    self.send_header(key, value)
                self.end_headers()
                self.wfile.write(body)

            do_POST = do_DELETE = do_GET

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        self.http_origin = f"http://127.0.0.1:{server.server_port}"
        try:
            yield
        finally:
            self.http_origin = None
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


@pytest.fixture
def storage_api(monkeypatch):
    return StorageAPI(monkeypatch)


@pytest.fixture
def storage_http_api(storage_api):
    with storage_api.over_http():
        yield storage_api


def test_publishable_key_scoped_upload_and_raw_gzip_over_real_http(storage_api):
    raw = gzip.compress(b"%PDF-1.4\nOriginal bytes", mtime=0)
    key = "sheet-music/ترنيمة #1+%.pdf.gz"
    storage_api.seed(
        "source1", "sheet-music", key, raw, encoding="gzip", metadata={"original": "name"}
    )
    with storage_api.over_http():
        source = storage_api.store("reader", source=True)
        data, details = source.get(key)
        assert data == raw and details["content_encoding"] == "gzip"
        assert details["metadata"] == {"original": "name"}
        writer = storage_api.store()
        writer.put("payloads/test.age", raw, {"cipher-sha256": "a" * 64})
        assert writer.get("payloads/test.age") == (
            raw,
            {
                "content_type": "application/octet-stream",
                "content_encoding": "",
                "metadata": {"cipher-sha256": "a" * 64},
            },
        )
        with pytest.raises(OpsError, match="409"):
            writer.put("payloads/test.age", b"overwrite")
        assert writer.get("payloads/test.age")[0] == raw
        pruner = storage_api.store("pruner", allow_delete=True)
        pruner.delete("payloads/test.age")
        assert pruner.head("payloads/test.age") is None


def test_flat_cursor_listing_preserves_nested_and_zero_byte_objects(storage_api, monkeypatch):
    monkeypatch.setattr("ops.supabase.PAGE_SIZE", 2)
    keys = [
        "root.pdf",
        "payloads/a/part.age",
        "payloads/b/part.age",
        "empty/.emptyFolderPlaceholder",
    ]
    for key in keys:
        storage_api.seed(
            "backup1", "choralation-backups", key, b"" if key.startswith("empty/") else b"abc"
        )
    store = storage_api.store()
    assert [row["Key"] for row in store.objects()] == sorted(keys)
    assert [row["Key"] for row in store.objects("payloads/")] == keys[1:3]
    assert [row["Key"] for row in store.objects("payloads/a/p")] == keys[1:2]
    assert next(row for row in store.objects() if row["Key"].startswith("empty/"))["Size"] == 0


@pytest.mark.parametrize("key", ["eyJlegacy", "sb_secret_elevated", "", "sb_publishable_"])
def test_rejects_legacy_and_privileged_keys_without_authentication(storage_api, monkeypatch, key):
    storage_api.store()
    monkeypatch.setenv("BACKUP_PUBLISHABLE_KEY", key)
    with pytest.raises(OpsError, match="PUBLISHABLE_KEY"):
        Store("BACKUP")
    assert not storage_api.requests


def test_token_reuse_expiry_and_single_401_reauthentication(storage_api):
    store = storage_api.store()
    assert store.objects() == []
    store.objects()
    assert storage_api.logins == 1
    store.expires_at = 0
    store.objects()
    assert storage_api.logins == 2
    storage_api.tokens.clear()  # server rejects an otherwise unexpired session
    store.objects()
    assert storage_api.logins == 3


@pytest.mark.parametrize("role,source", [("reader", False), ("pruner", False), ("reader", True)])
def test_upload_permissions_and_local_delete_guard(storage_api, role, source):
    store = storage_api.store(role, source=source)
    with pytest.raises(OpsError, match="403"):
        store.put("forbidden.age", b"data")
    before = len(storage_api.requests)
    with pytest.raises(OpsError, match="cannot delete"):
        store.delete("forbidden.age")
    assert len(storage_api.requests) == before


def test_silent_rls_delete_denial_fails_and_other_bucket_is_denied(storage_api):
    writer = storage_api.store(allow_delete=True)
    writer.put("keep.age", b"keep")
    with pytest.raises(OpsError, match="not applied"):
        writer.delete("keep.age")
    writer.bucket = "another-private-bucket"
    with pytest.raises(OpsError, match="403"):
        writer.get("keep.age")


@pytest.mark.parametrize(
    "status,details,absent",
    [
        (404, {"code": "NoSuchKey"}, True),
        (400, {"statusCode": "404", "error": "not_found"}, True),
        (400, {"code": "NoSuchKey"}, True),
        (400, {"code": "InvalidRequest"}, False),
        (403, {"message": "private-token-and-key"}, False),
    ],
)
def test_missing_objects_distinguished_from_access_and_request_failures(
    storage_api, status, details, absent
):
    store = storage_api.store()

    def fault(request):
        if "/storage/v1/" in request.full_url:
            storage_api.fail(request, status, details)

    storage_api.fault = fault
    if absent:
        assert store.head("missing.age") is None
    else:
        with pytest.raises(OpsError) as error:
            store.head("missing.age")
        assert "private-token-and-key" not in str(error.value)


def test_transient_reads_retry_but_ambiguous_uploads_do_not(storage_api):
    store = storage_api.store()
    failures = 0

    def fault(request):
        nonlocal failures
        if "/list-v2/" in request.full_url and failures < 2:
            failures += 1
            storage_api.fail(request, 503, {"message": "private backend failure"})

    storage_api.fault = fault
    assert store.objects() == [] and failures == 2

    def ambiguous_upload(request):
        if request.method == "POST" and "/object/choralation-backups/" in request.full_url:
            raise OSError("private credential-bearing response")

    storage_api.fault = ambiguous_upload
    before = len(storage_api.requests)
    with pytest.raises(OpsError, match="details suppressed"):
        store.put("once.age", b"ciphertext")
    assert len(storage_api.requests) == before + 1


@pytest.mark.parametrize(
    "page",
    [
        {"folders": [], "objects": [], "hasNext": True},
        {"folders": [], "objects": [], "hasNext": True, "nextCursor": "repeated"},
        {"folders": [{"name": "folder"}], "objects": [], "hasNext": False},
        {"folders": [], "objects": [{"name": "broken"}], "hasNext": False},
    ],
)
def test_incomplete_or_looping_listings_cannot_be_accepted(storage_api, page):
    def fault(request):
        if "/list-v2/" in request.full_url:
            return Response(json.dumps(page).encode())

    storage_api.fault = fault
    with pytest.raises(OpsError):
        storage_api.store().objects()


def test_incomplete_download_and_redirects_fail_without_leaking_details(storage_api):
    key = "file.pdf"
    storage_api.seed("source1", "sheet-music", key, b"12345")
    store = storage_api.store("reader", source=True)

    def truncated(request):
        if "/object/authenticated/" in request.full_url:
            return Response(b"1234")

    storage_api.fault = truncated
    with pytest.raises(OpsError, match="incomplete"):
        store.get(key)

    def redirect(request):
        if "/storage/v1/" in request.full_url:
            raise urllib.error.HTTPError(
                request.full_url,
                302,
                "redirect",
                {"Location": "https://other.example.test/private"},
                io.BytesIO(b""),
            )

    storage_api.fault = redirect
    with storage_api.over_http():
        store = storage_api.store("reader", source=True)
        before = len(storage_api.requests)
        with pytest.raises(OpsError, match="302"):
            store.get(key)
        assert len(storage_api.requests) == before + 2  # login, info; no redirect request


def test_rest_repository_preserves_integrity_deduplication_and_retention(storage_api, tmp_path):
    from test_production_operations import TestRepository

    writer = storage_api.store()
    repository = TestRepository(writer)
    path = tmp_path / "pdf"
    path.write_bytes(gzip.compress(b"%PDF-1.4\nAll quality retained", mtime=0))
    payload = repository.payload(path)
    assert repository.payload(path) == payload
    start = datetime.now(UTC) - timedelta(days=20)
    for index in range(10):
        repository.complete(
            {
                "format": 1,
                "id": f"rest-{index}",
                "kind": "daily",
                "created_at": (start + timedelta(days=index)).isoformat(),
                "database": payload,
                "objects": [{"payload": payload}],
            }
        )
    reader = TestRepository(storage_api.store("reader"))
    reader.restore_payload(
        reader.manifest(reader.snapshots()[0])["database"], tmp_path / "restored"
    )
    assert (tmp_path / "restored").read_bytes() == path.read_bytes()
    pruner = TestRepository(storage_api.store("pruner", allow_delete=True))
    pruner.prune()
    assert len(pruner.snapshots()) == 7
    assert writer.get(payload["parts"][0]["key"])[0].startswith(b"test-encrypted:")


def test_corrupt_rest_upload_never_writes_completion_marker(storage_api):
    from test_production_operations import TestRepository

    def corrupt(request):
        if "/object/authenticated/" in request.full_url:
            return Response(b"damaged")

    repository = TestRepository(storage_api.store())
    storage_api.fault = corrupt
    with pytest.raises(OpsError):
        repository.put_verified("payloads/test.age", b"correct")
    assert not any(key.endswith("complete.json") for _, _, key in storage_api.rows)
