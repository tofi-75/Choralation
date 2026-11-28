"""Attended Storage acceptance. Production is read-only; mutations target probes only."""

import base64
import json
import re
import urllib.error
import urllib.request
from uuid import UUID

from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row

from .core import OpsError
from .database import connect
from .supabase import StorageRequestError

SOURCE_PROJECT = "lhwtctrekcllnpselhsb"
BACKUP_PROJECT = "rkusfrltpycgkeodtxca"
SOURCE_BUCKET = "sheet-music"
BACKUP_BUCKET = "choralation-backups"
SUBJECTS = {
    "source": "bd179bb0-6208-4907-addb-dfd0b4eefb95",
    "writer": "9cc4eaa6-7c41-4762-9732-759d245a3d31",
    "reader": "44fe3b8f-4b64-4d7d-92fd-470bf198e321",
    "pruner": "f1520d8b-115f-49af-8ef1-0301532d30cc",
}
PROBE_NAMES = ("probe.bin", "reader-create.bin", "pruner-create.bin")


def check_identity(store, subject):
    # Claims come directly from this project's authenticated HTTPS sign-in;
    # Storage still verifies the bearer token on every actual API request.
    store.authenticate()
    try:
        parts = store.token.split(".")
        if len(parts) != 3:
            raise ValueError
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
        matches = claims.get("role") == "authenticated" and UUID(claims["sub"]) == UUID(subject)
    except (ValueError, TypeError, KeyError):
        matches = False
    if not matches:
        raise OpsError("Storage acceptance identity differs from the reviewed policy account.")


def check_private_bucket(store):
    visible = store.json("bucket")
    if (
        not isinstance(visible, list)
        or len(visible) != 1
        or not isinstance(visible[0], dict)
        or visible[0].get("id") != store.bucket
        or visible[0].get("public") is not False
    ):
        raise OpsError("Storage bucket visibility/private settings differ from the reviewed scope.")
    bucket = store.json("bucket/" + store.bucket)
    if (
        not isinstance(bucket, dict)
        or bucket.get("id") != store.bucket
        or bucket.get("public") is not False
    ):
        raise OpsError("Expected private storage bucket cannot be verified.")


def check_table_api_denied(store):
    """Read zero rows; table grants must not expose Django data through this API."""
    request = urllib.request.Request(
        store.origin + "/rest/v1/hymns_hymn?select=id&limit=0",
        headers={"apikey": store.key, "Authorization": f"Bearer {store.token}"},
    )
    try:
        with store.opener.open(request, timeout=15) as response:
            response.read(8192)  # Never log or persist response contents.
    except urllib.error.HTTPError as error:
        try:
            try:
                details = json.loads(error.read(8192))
            except (ValueError, OSError):
                details = {}
            code = details.get("code") if isinstance(details, dict) else None
            if error.code in {401, 403, 404} and not code:
                return
            if error.code == 406 and code == "PGRST106":
                return
        finally:
            error.close()
        raise OpsError(
            "Production table API denial could not be verified; check Data API settings."
        ) from None
    except OSError:
        raise OpsError(
            "Production table API check unavailable; this is not proof of denial."
        ) from None
    raise OpsError(
        "Production table API is reachable; disable the unused Data API before acceptance."
    )


def validate_policies(rows, *, source):
    """Fail closed on extra rules, bypass, owners, disabled RLS or changed scopes."""
    bucket = SOURCE_BUCKET if source else BACKUP_BUCKET
    uid = SUBJECTS["source"]

    def predicate(column, subjects):
        if len(subjects) == 1:
            who = f"'{subjects[0]}'::uuid"
        else:
            who = "ANY(ARRAY[" + ",".join(f"'{subject}'::uuid" for subject in subjects) + "])"
        return f"(({column}='{bucket}'::text)AND(auth.uid()={who}))"

    def compact(value):
        if not isinstance(value, str):
            return value
        # Preserve quoted values: whitespace inside a bucket name changes scope.
        return re.sub(
            r"'(?:''|[^'])*'|\s+", lambda match: match[0] if match[0].startswith("'") else "", value
        )

    if source:
        expected = {
            "choralation_backup_source_bucket_read": (
                "buckets",
                "SELECT",
                predicate("id", [uid]),
                None,
            ),
            "choralation_backup_source_objects_read": (
                "objects",
                "SELECT",
                predicate("bucket_id", [uid]),
                None,
            ),
        }
    else:
        subjects = [SUBJECTS[role] for role in ("writer", "reader", "pruner")]
        expected = {
            "choralation_backup_bucket_read": (
                "buckets",
                "SELECT",
                predicate("id", subjects),
                None,
            ),
            "choralation_backup_objects_read": (
                "objects",
                "SELECT",
                predicate("bucket_id", subjects),
                None,
            ),
            "choralation_backup_objects_insert": (
                "objects",
                "INSERT",
                None,
                predicate("bucket_id", [SUBJECTS["writer"]]),
            ),
            "choralation_backup_objects_delete": (
                "objects",
                "DELETE",
                predicate("bucket_id", [SUBJECTS["pruner"]]),
                None,
            ),
        }
    if not isinstance(rows, list) or len(rows) != len(expected):
        raise OpsError("Storage acceptance needs exactly the reviewed Storage policy set.")
    seen = set()
    for row in rows:
        if not isinstance(row, dict):
            raise OpsError("Storage policy metadata is incomplete.")
        name = row.get("policyname")
        actual = (
            row.get("tablename"),
            row.get("cmd"),
            compact(row.get("using_expression")),
            compact(row.get("check_expression")),
        )
        reviewed = expected.get(name)
        # The browser setup uses an uncorrelated SELECT; the generic template
        # calls uid() directly. Accept only these two complete reviewed shapes.
        allowed = set()
        if reviewed is not None:
            allowed = {
                reviewed,
                tuple(
                    part.replace("auth.uid()", "(SELECTauth.uid()ASuid)")
                    if isinstance(part, str)
                    else part
                    for part in reviewed
                ),
            }
        if (
            name not in expected
            or name in seen
            or actual not in allowed
            or row.get("roles") != ["authenticated"]
            or row.get("permissive") != "PERMISSIVE"
            or row.get("rls_enabled") is not True
            or any(
                row.get(key) is not False
                for key in (
                    "authenticated_superuser",
                    "authenticated_bypass_rls",
                    "authenticated_is_table_owner",
                )
            )
        ):
            raise OpsError("Storage policy scope, RLS or authenticated-role restrictions changed.")
        seen.add(name)


def audit_source(store, reader_url, policy_sql):
    target = conninfo_to_dict(reader_url)
    if (
        store.project != SOURCE_PROJECT
        or store.bucket != SOURCE_BUCKET
        or target.get("host") != "aws-1-eu-central-1.pooler.supabase.com"
        or target.get("port") != "5432"
        or target.get("sslmode") != "require"
        or target.get("user") != "choralation_backup." + SOURCE_PROJECT
        or target.get("dbname") != "postgres"
    ):
        raise OpsError("Source acceptance must use the reviewed production reader and bucket.")
    check_identity(store, SUBJECTS["source"])
    with connect(reader_url) as connection:
        connection.execute("BEGIN READ ONLY")
        with connection.cursor(row_factory=dict_row) as cursor:
            cursor.execute(policy_sql)
            validate_policies(cursor.fetchall(), source=True)
    check_private_bucket(store)
    objects = store.objects()
    nonempty = [item for item in objects if item["Size"] > 0]
    if not nonempty:
        raise OpsError("Source acceptance requires an existing nonempty uploaded object.")
    sample = min(nonempty, key=lambda row: row["Size"])
    data, _ = store.get(sample["Key"])
    if len(data) != sample["Size"]:
        raise OpsError("Source object changed during acceptance.")
    check_table_api_denied(store)
    return {
        "status": "passed",
        "phase": "source",
        "objects": len(objects),
        "storage_read_only_rls_scope": True,
        "public_table_query_denied": True,
        "private_bucket": True,
    }


class Probe:
    def __init__(self, store, identifier, *, project=BACKUP_PROJECT):
        if (
            store.project != project
            or store.bucket != BACKUP_BUCKET
            or not re.fullmatch(r"[0-9]{1,20}-[0-9]{1,6}", identifier)
        ):
            raise OpsError(
                "Permission probes require the reviewed backup bucket and run identifier."
            )
        self.store = store
        self.prefix = "_permissions-checks/" + identifier + "/"
        self.data = ("Choralation public permission probe " + identifier + "\n").encode()
        self.changed = self.data + b"mutation-test\n"

    def key(self, name="probe.bin"):
        if name not in PROBE_NAMES:
            raise OpsError("Only declared permission probe objects may be changed.")
        return self.prefix + name

    def unchanged(self):
        if self.store.get(self.key())[0] != self.data:
            raise OpsError("A denied operation changed the disposable permission probe.")

    def denied(self, operation):
        try:
            operation()
        except StorageRequestError as error:
            if error.status == 403 or (error.status == 400 and error.provider_status == 403):
                return
            raise OpsError("Acceptance request failed without proving an access denial.") from None
        raise OpsError("An unauthorized disposable probe write was accepted; review RLS.")

    def deny_updates(self):
        for method, upsert in (("PUT", "false"), ("POST", "true")):
            self.denied(
                lambda method=method, upsert=upsert: self.store.request(
                    "object/" + self.store.object_path(self.key()),
                    method=method,
                    body=self.changed,
                    headers={"Content-Type": "application/octet-stream", "x-upsert": upsert},
                    safe=False,
                )
            )
            self.unchanged()

    def deny_delete(self):
        try:
            self.store.json(
                "object/" + self.store.bucket,
                method="DELETE",
                payload={"prefixes": [self.key()]},
                safe=False,
            )
        except StorageRequestError as error:
            if not (error.status == 403 or (error.status == 400 and error.provider_status == 403)):
                raise OpsError("Delete request failed without proving an access denial.") from None
        # Storage can return 200 with no deleted rows when RLS denies DELETE.
        self.unchanged()

    def writer(self):
        if self.store.head(self.key()) is not None:
            raise OpsError("Probe already exists; use a new workflow run attempt.")
        self.store.put(self.key(), self.data)
        self.unchanged()
        self.deny_updates()
        self.deny_delete()

    def reader(self):
        self.unchanged()
        self.denied(lambda: self.store.put(self.key("reader-create.bin"), self.data))
        self.deny_updates()
        self.deny_delete()

    def pruner(self):
        self.unchanged()
        self.denied(lambda: self.store.put(self.key("pruner-create.bin"), self.data))
        self.deny_updates()
        self.store.delete(self.key())
        if self.store.head(self.key()) is not None:
            raise OpsError("Pruner could not remove its disposable permission probe.")

    def cleanup(self):
        for name in PROBE_NAMES:
            key = self.key(name)
            if self.store.head(key) is None:
                continue
            if self.store.get(key)[0] not in {self.data, self.changed}:
                raise OpsError("Unexpected probe content; refusing cleanup deletion.")
            self.store.delete(key)
        if self.store.objects(self.prefix):
            raise OpsError("Probe cleanup is incomplete; inspect this run's probe prefix.")
