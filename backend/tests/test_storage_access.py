"""Permission checks use public disposable probes, never real backup/PDF objects."""

import base64
import copy
import json
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
import yaml
from ops import access
from ops.access import Probe, check_identity, check_private_bucket, validate_policies
from ops.core import OpsError
from ops.supabase import StorageRequestError
from test_supabase_storage import Response
from test_supabase_storage import storage_api as storage_api
from test_supabase_storage import storage_http_api as storage_http_api


def test_every_backup_identity_over_real_http_and_no_backup_or_pdf_mutation(storage_http_api):
    api = storage_http_api
    api.seed("source1", "sheet-music", "real.pdf", b"%PDF-real-source")
    api.seed("backup1", "choralation-backups", "payloads/real.age", b"real-encrypted-backup")
    for role in ("writer", "reader", "pruner"):
        store = api.store(role, allow_delete=role == "pruner")
        check_identity(store, api.subjects[role])
        check_private_bucket(store)
        probe = Probe(store, "12345-1", project="backup1")
        getattr(probe, role)()
    Probe(api.store("pruner", allow_delete=True), "12345-1", project="backup1").cleanup()
    assert set(api.rows) == {
        ("source1", "sheet-music", "real.pdf"),
        ("backup1", "choralation-backups", "payloads/real.age"),
    }
    assert api.rows["source1", "sheet-music", "real.pdf"]["data"] == b"%PDF-real-source"
    assert (
        api.rows["backup1", "choralation-backups", "payloads/real.age"]["data"]
        == b"real-encrypted-backup"
    )
    deletes = [r for r in api.requests if r.method == "DELETE"]
    assert deletes and all(json.loads(r.data)["prefixes"] == [probe.key()] for r in deletes)
    assert any(r.method == "PUT" for r in api.requests)
    assert any(
        dict((k.lower(), v) for k, v in r.header_items()).get("x-upsert") == "true"
        for r in api.requests
    )


@pytest.mark.parametrize(
    "identifier", ["", "../payloads", "123-1/../snapshots", "test-run", "1-2-3"]
)
def test_invalid_probe_prefix_is_rejected_before_requests(storage_api, identifier):
    with pytest.raises(OpsError, match="run identifier"):
        Probe(storage_api.store(), identifier, project="backup1")
    assert not storage_api.requests


def test_source_or_wrong_project_cannot_be_a_mutation_target(storage_api):
    with pytest.raises(OpsError, match="backup bucket"):
        Probe(storage_api.store("reader", source=True), "123-1", project="backup1")
    with pytest.raises(OpsError):
        Probe(storage_api.store(), "123-1")  # production guard rejects the fictional project
    assert not storage_api.requests


@pytest.mark.parametrize(
    "status,provider,denied",
    [
        (403, None, True),
        (400, 403, True),
        (400, 400, False),
        (401, None, False),
        (409, None, False),
        (503, None, False),
    ],
)
def test_only_real_permission_errors_count_as_denials(storage_api, status, provider, denied):
    probe = Probe(storage_api.store(), "123-1", project="backup1")

    def operation():
        raise StorageRequestError(status, provider)

    if denied:
        probe.denied(operation)
    else:
        with pytest.raises(OpsError, match="without proving"):
            probe.denied(operation)


def test_unexpected_update_is_detected_and_only_its_probe_is_cleaned(storage_api):
    api = storage_api
    writer = api.store()
    probe = Probe(writer, "123-1", project="backup1")
    api.seed("backup1", "choralation-backups", "snapshots/keep/complete.json", b"keep")

    def fault(request):
        if request.method == "PUT":
            api.rows["backup1", "choralation-backups", probe.key()]["data"] = request.data
            return Response(b"{}")
        return None

    api.fault = fault
    with pytest.raises(OpsError, match="unauthorized"):
        probe.writer()
    api.fault = None
    Probe(api.store("pruner", allow_delete=True), "123-1", project="backup1").cleanup()
    assert set(api.rows) == {("backup1", "choralation-backups", "snapshots/keep/complete.json")}


def test_cleanup_refuses_unknown_data_and_never_deletes_other_names(storage_api):
    api = storage_api
    probe = Probe(api.store("pruner", allow_delete=True), "123-1", project="backup1")
    api.seed("backup1", "choralation-backups", probe.key(), b"not-a-public-permission-probe")
    with pytest.raises(OpsError, match="Unexpected probe content"):
        probe.cleanup()
    assert not any(r.method == "DELETE" for r in api.requests)
    with pytest.raises(OpsError, match="declared"):
        probe.key("../../payloads/keep.age")


def test_silent_delete_permission_failure_cannot_pass_pruner(storage_api):
    writer = storage_api.store()
    probe = Probe(writer, "123-1", project="backup1")
    writer.put(probe.key(), probe.data)
    # Explicitly allow the local client to issue DELETE; server RLS denies it.
    wrong = Probe(storage_api.store("reader", allow_delete=True), "123-1", project="backup1")
    with pytest.raises(OpsError, match="not applied"):
        wrong.store.delete(wrong.key())
    wrong.unchanged()


@pytest.mark.parametrize(
    "role,subject",
    [("service_role", access.SUBJECTS["writer"]), ("authenticated", access.SUBJECTS["reader"])],
)
def test_wrong_or_elevated_identity_is_rejected(role, subject):
    claims = base64.urlsafe_b64encode(json.dumps({"sub": subject, "role": role}).encode()).decode()
    store = SimpleNamespace(token="header." + claims + ".signature", authenticate=lambda: None)
    with pytest.raises(OpsError, match="identity differs"):
        check_identity(store, access.SUBJECTS["writer"])


def source_policies():
    rows = []
    for table, column, name in (("buckets", "id", "bucket"), ("objects", "bucket_id", "objects")):
        rows.append(
            {
                "tablename": table,
                "policyname": "choralation_backup_source_" + name + "_read",
                "roles": ["authenticated"],
                "cmd": "SELECT",
                "permissive": "PERMISSIVE",
                "using_expression": f"(({column} = 'sheet-music'::text) AND (auth.uid() = '{access.SUBJECTS['source']}'::uuid))",
                "check_expression": None,
                "rls_enabled": True,
                "authenticated_superuser": False,
                "authenticated_bypass_rls": False,
                "authenticated_is_table_owner": False,
            }
        )
    return rows


def test_reviewed_live_source_policy_scope_is_accepted():
    validate_policies(source_policies(), source=True)


def backup_policies():
    flags = {
        "roles": ["authenticated"],
        "permissive": "PERMISSIVE",
        "rls_enabled": True,
        "authenticated_superuser": False,
        "authenticated_bypass_rls": False,
        "authenticated_is_table_owner": False,
    }
    identities = ", ".join(
        f"'{access.SUBJECTS[role]}'::uuid" for role in ("writer", "reader", "pruner")
    )
    rows = []
    for table, column, name, command, identity in (
        ("buckets", "id", "bucket_read", "SELECT", f"ANY (ARRAY[{identities}])"),
        ("objects", "bucket_id", "objects_read", "SELECT", f"ANY (ARRAY[{identities}])"),
        (
            "objects",
            "bucket_id",
            "objects_insert",
            "INSERT",
            f"'{access.SUBJECTS['writer']}'::uuid",
        ),
        (
            "objects",
            "bucket_id",
            "objects_delete",
            "DELETE",
            f"'{access.SUBJECTS['pruner']}'::uuid",
        ),
    ):
        condition = f"(({column} = 'choralation-backups'::text) AND (auth.uid() = {identity}))"
        rows.append(
            {
                **flags,
                "tablename": table,
                "policyname": "choralation_backup_" + name,
                "cmd": command,
                "using_expression": None if command == "INSERT" else condition,
                "check_expression": condition if command == "INSERT" else None,
            }
        )
    return rows


@pytest.mark.parametrize("cached_uid", [False, True])
def test_expected_backup_policy_scope_is_accepted(cached_uid):
    rows = backup_policies()
    if cached_uid:
        for row in rows:
            for key in ("using_expression", "check_expression"):
                if row[key]:
                    row[key] = row[key].replace("auth.uid()", "( SELECT auth.uid() AS uid)")
    validate_policies(rows, source=False)


@pytest.mark.parametrize("extra", [" WHERE true", " FROM auth.users", " UNION SELECT NULL::uuid"])
def test_unreviewed_uid_subqueries_are_rejected(extra):
    rows = backup_policies()
    rows[0]["using_expression"] = rows[0]["using_expression"].replace(
        "auth.uid()", "( SELECT auth.uid() AS uid" + extra + ")"
    )
    with pytest.raises(OpsError, match="scope"):
        validate_policies(rows, source=False)


@pytest.mark.parametrize("command", ["INSERT", "DELETE"])
def test_backup_write_permissions_cannot_be_assigned_to_reader(command):
    rows = backup_policies()
    for row in rows:
        if row["cmd"] == command:
            key = "check_expression" if command == "INSERT" else "using_expression"
            original = access.SUBJECTS["writer" if command == "INSERT" else "pruner"]
            row[key] = row[key].replace(original, access.SUBJECTS["reader"])
    with pytest.raises(OpsError, match="scope"):
        validate_policies(rows, source=False)


@pytest.mark.parametrize(
    "change",
    [
        "public_role",
        "extra_policy",
        "bypass",
        "no_rls",
        "owner",
        "broader_bucket",
        "duplicate",
        "missing_flags",
    ],
)
def test_policy_scope_cannot_be_weakened(change):
    rows = copy.deepcopy(source_policies())
    if change == "public_role":
        rows[0]["roles"] = ["public"]
    elif change == "extra_policy":
        rows.append({**rows[0], "policyname": "extra"})
    elif change == "bypass":
        rows[0]["authenticated_bypass_rls"] = True
    elif change == "no_rls":
        rows[0]["rls_enabled"] = False
    elif change == "owner":
        rows[0]["authenticated_is_table_owner"] = True
    elif change == "broader_bucket":
        rows[0]["using_expression"] += " OR true"
    elif change == "duplicate":
        rows[1] = rows[0]
    elif change == "missing_flags":
        del rows[0]["authenticated_superuser"]
    with pytest.raises(OpsError):
        validate_policies(rows, source=True)


@pytest.mark.parametrize("disabled_confirmed", [False, True])
def test_source_audit_uses_readonly_catalog_and_only_reads_storage(
    storage_api, monkeypatch, disabled_confirmed
):
    api = storage_api
    monkeypatch.setattr(access, "SOURCE_PROJECT", "source1")
    monkeypatch.setitem(access.SUBJECTS, "source", api.subjects["source"])
    api.seed("source1", "sheet-music", "existing.pdf", b"%PDF-existing")
    if disabled_confirmed:

        def fault(request):
            if "/rest/v1/" in request.full_url:
                api.fail(request, 503, {"code": "PGRST002"})
            return None

        api.fault = fault
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.cursor.return_value.__enter__.return_value.fetchall.return_value = source_policies()
    monkeypatch.setattr(access, "connect", lambda _: connection)
    url = "postgresql://choralation_backup.source1:fictional@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require"
    result = access.audit_source(
        api.store("reader", source=True),
        url,
        "SELECT reviewed_catalog_only",
        disabled_confirmed=disabled_confirmed,
    )
    assert result["status"] == "passed" and result["objects"] == 1
    assert result["public_table_query_denied"] is (not disabled_confirmed)
    assert result["data_api_disabled_confirmed"] is disabled_confirmed
    assert result["data_api_check"] == (
        "disabled_schema_cache_unavailable" if disabled_confirmed else "request_denied"
    )
    connection.execute.assert_called_once_with("BEGIN READ ONLY")
    assert all(
        r.get_method() == "GET"
        or "/auth/v1/token" in r.full_url
        or "/object/list-v2/" in r.full_url
        for r in api.requests
    )


@pytest.mark.parametrize(
    "rows",
    [
        [],
        [{"id": "choralation-backups", "public": True}],
        [{"id": "choralation-backups", "public": False}, {"id": "foreign", "public": False}],
        {"id": "choralation-backups", "public": False},
    ],
)
def test_public_or_broader_bucket_visibility_fails(storage_api, rows):
    def fault(request):
        if request.full_url.endswith("/storage/v1/bucket"):
            return Response(json.dumps(rows).encode())
        return None

    storage_api.fault = fault
    with pytest.raises(OpsError, match="visibility/private"):
        check_private_bucket(storage_api.store())


def test_quoted_bucket_whitespace_cannot_be_normalized_into_an_allowed_scope():
    rows = source_policies()
    rows[0]["using_expression"] = rows[0]["using_expression"].replace("sheet-music", "sheet- music")
    with pytest.raises(OpsError, match="scope"):
        validate_policies(rows, source=True)


def test_unexpected_reader_create_is_cleaned_without_removing_real_backups(storage_api):
    api = storage_api
    probe = Probe(api.store(), "123-1", project="backup1")
    probe.writer()
    api.seed("backup1", "choralation-backups", "payloads/keep.age", b"private-backup")

    def fault(request):
        if request.method == "POST" and request.full_url.endswith(probe.key("reader-create.bin")):
            api.seed("backup1", "choralation-backups", probe.key("reader-create.bin"), request.data)
            return Response(b"{}")
        return None

    api.fault = fault
    with pytest.raises(OpsError, match="unauthorized"):
        Probe(api.store("reader"), "123-1", project="backup1").reader()
    api.fault = None
    Probe(api.store("pruner", allow_delete=True), "123-1", project="backup1").cleanup()
    assert set(api.rows) == {("backup1", "choralation-backups", "payloads/keep.age")}


def test_access_workflow_is_main_only_manual_and_keeps_credentials_separate():
    root = Path(__file__).resolve().parents[2]
    text = (root / ".github/workflows/storage-access-check.yml").read_text()
    workflow = yaml.safe_load(text)
    assert set(workflow.get("on", workflow.get(True))) == {"workflow_dispatch"}
    dispatch = workflow.get("on", workflow.get(True))["workflow_dispatch"]
    assert dispatch["inputs"]["source_data_api_disabled_confirmed"] == {
        "description": "I verified Enable Data API is OFF in the production Supabase project",
        "type": "boolean",
        "required": True,
        "default": False,
    }
    assert workflow["permissions"] == {"contents": "read"}
    assert workflow["concurrency"]["group"] == "choralation-production-operations"
    assert workflow["concurrency"]["cancel-in-progress"] is False
    assert workflow["env"]["ACCESS_PROBE_ID"] == "${{ github.run_id }}-${{ github.run_attempt }}"
    jobs = workflow["jobs"]
    assert jobs["source"]["if"] == jobs["writer"]["if"] == "github.ref == 'refs/heads/main'"
    assert (
        jobs["source"]["env"]["SOURCE_DATA_API_DISABLED_CONFIRMED"]
        == "${{ inputs.source_data_api_disabled_confirmed }}"
    )
    assert jobs["reader"]["needs"] == "writer"
    assert jobs["pruner"]["needs"] == ["writer", "reader"]
    assert "always()" in jobs["cleanup"]["if"] and "refs/heads/main" in jobs["cleanup"]["if"]
    expected = {
        "source": "production-operations",
        "writer": "production-operations",
        "reader": "backup-restore",
        "pruner": "backup-retention",
        "cleanup": "backup-retention",
    }
    for name, environment in expected.items():
        assert jobs[name]["environment"] == environment
        actual = json.dumps(jobs[name]["env"])
        if name == "source":
            assert "BACKUP_DATABASE_URL" in actual
            assert not any(
                value in actual for value in ("BACKUP_WRITER", "BACKUP_READER", "BACKUP_PRUNER")
            )
        else:
            role = "pruner" if name == "cleanup" else name
            assert f"BACKUP_{role.upper()}_PASSWORD" in actual
            assert not any(
                f"BACKUP_{other.upper()}_PASSWORD" in actual
                for other in ("writer", "reader", "pruner")
                if other != role
            )
    assert not any(
        value in text for value in ("RENDER_API_KEY", "DEPLOY_CHECK_TOKEN", "BACKUP_AGE_IDENTITY")
    )
    assert set(jobs["acceptance"]["needs"]) == set(expected)


@pytest.mark.parametrize(
    "status,body,allowed",
    [
        (404, {"message": "Data API disabled"}, True),
        (403, {"message": "Data API disabled"}, True),
        (401, {"message": "Data API disabled"}, True),
        (406, {"code": "PGRST106"}, True),
        (404, {"code": "PGRST205"}, False),
        (401, {"code": "PGRST301"}, False),
        (403, {"code": "42501"}, False),
        (500, {"message": "unavailable"}, False),
        (503, {"code": "PGRST002"}, False),
    ],
)
def test_table_api_denial_does_not_accept_bad_jwt_missing_table_or_outage(
    storage_api, status, body, allowed
):
    store = storage_api.store("reader", source=True)
    store.authenticate()

    def fault(request):
        if "/rest/v1/" in request.full_url:
            storage_api.fail(request, status, body)
        return None

    storage_api.fault = fault
    if allowed:
        access.check_table_api_denied(store)
    else:
        with pytest.raises(OpsError, match="could not be verified"):
            access.check_table_api_denied(store)


def test_reachable_table_api_and_network_failures_block_acceptance(storage_api):
    store = storage_api.store("reader", source=True)
    store.authenticate()
    storage_api.fault = lambda request: Response(b"[]") if "/rest/v1/" in request.full_url else None
    with pytest.raises(OpsError, match="is reachable"):
        access.check_table_api_denied(store)

    def outage(request):
        raise OSError("private credential-bearing connection detail")

    storage_api.fault = outage
    with pytest.raises(OpsError, match="not proof of denial") as error:
        access.check_table_api_denied(store)
    assert "credential-bearing" not in str(error.value)


@pytest.mark.parametrize("status,code", [(503, "PGRST002"), (503, "PGRST001"), (500, "PGRST002")])
def test_only_documented_disabled_api_response_can_use_owner_confirmation(
    storage_api, status, code
):
    store = storage_api.store("reader", source=True)
    store.authenticate()

    def fault(request):
        if "/rest/v1/" in request.full_url:
            assert request.get_header("Accept-profile") == "public"
            storage_api.fail(request, status, {"code": code})
        return None

    storage_api.fault = fault
    if (status, code) == (503, "PGRST002"):
        assert (
            access.check_table_api_denied(store, disabled_confirmed=True)
            == "disabled_schema_cache_unavailable"
        )
    else:
        with pytest.raises(OpsError, match="could not be verified"):
            access.check_table_api_denied(store, disabled_confirmed=True)


def test_table_api_diagnostic_code_never_includes_provider_message_or_untrusted_text(storage_api):
    store = storage_api.store("reader", source=True)
    store.authenticate()

    def fault(request):
        if "/rest/v1/" in request.full_url:
            storage_api.fail(
                request,
                503,
                {"code": "private-response-detail", "message": "private-response-detail"},
            )
        return None

    storage_api.fault = fault
    with pytest.raises(OpsError) as error:
        access.check_table_api_denied(store, disabled_confirmed=True)
    assert "HTTP 503, provider code unavailable" in str(error.value)
    assert "private-response-detail" not in str(error.value)
