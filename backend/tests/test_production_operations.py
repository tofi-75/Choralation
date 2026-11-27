"""Backup integrity and deployment failure boundaries, without production credentials."""

import gzip
import json
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client
from ops.core import OpsError
from ops.release import run_operation, validate_ci
from ops.snapshot import create_snapshot
from ops.storage import Repository, independent_stores
from rest_framework.test import APIClient

from common.models import OperationsState
from common.operations import ReadOnlyError, mutation_guard


class MemoryStore:
    project = "backup"
    bucket = "private-backups"

    def __init__(self):
        self.rows = {}

    def objects(self, prefix=""):
        return [
            {"Key": key, "Size": len(row[0]), "LastModified": row[2]}
            for key, row in self.rows.items()
            if key.startswith(prefix)
        ]

    def get(self, key):
        if key not in self.rows:
            raise OpsError("Missing test object")
        data, metadata, _ = self.rows[key]
        return data, {
            "content_type": "application/pdf",
            "content_encoding": "",
            "metadata": metadata,
        }

    def put(self, key, data, metadata=None):
        assert key not in self.rows, "Writer must never overwrite backup objects"
        self.rows[key] = (data, metadata or {}, datetime.now(UTC))

    def head(self, key):
        return {"exists": True} if key in self.rows else None

    def delete(self, key):
        self.rows.pop(key, None)


class TestRepository(Repository):
    __test__ = False

    def encrypt(self, data):
        return b"test-encrypted:" + data

    def decrypt(self, data):
        assert data.startswith(b"test-encrypted:")
        return data[len(b"test-encrypted:") :]


def test_payload_deduplication_preserves_both_pdf_representations(tmp_path):
    store = MemoryStore()
    repository = TestRepository(store)
    for index, data in enumerate(
        (b"%PDF-1.4\nquality\n%%EOF", gzip.compress(b"%PDF-1.4\nquality\n%%EOF", mtime=0))
    ):
        original, restored = tmp_path / f"original-{index}", tmp_path / f"restored-{index}"
        original.write_bytes(data)
        record = repository.payload(original)
        count = len(store.rows)
        assert repository.payload(original) == record
        assert len(store.rows) == count
        repository.restore_payload(record, restored)
        assert restored.read_bytes() == data
        key = record["parts"][0]["key"]
        previous = store.rows[key]
        store.rows[key] = (b"corrupt", previous[1], previous[2])
        with pytest.raises(OpsError, match="corrupt"):
            repository.restore_payload(record, restored)
        store.rows[key] = previous


def test_chunking_and_storage_limit_fail_closed(tmp_path, monkeypatch):
    monkeypatch.setattr("ops.storage.CHUNK_SIZE", 4)
    file = tmp_path / "input"
    file.write_bytes(b"123456789")
    repository = TestRepository(MemoryStore())
    record = repository.payload(file)
    assert len(record["parts"]) == 3
    repository.restore_payload(record, tmp_path / "output")
    assert (tmp_path / "output").read_bytes() == file.read_bytes()
    with pytest.raises(OpsError, match="budget"):
        TestRepository(MemoryStore(), budget=1).payload(file)


def test_corrupt_readback_never_completes_a_snapshot():
    store = MemoryStore()
    repository = TestRepository(store)
    original = store.get
    store.get = lambda key: (b"damaged", original(key)[1])
    with pytest.raises(OpsError, match="verification"):
        repository.complete(
            {"id": "failed", "kind": "daily", "created_at": "2026-01-01T00:00:00+00:00"}
        )
    assert not any(key.endswith("complete.json") for key in store.rows)


def test_explicit_restore_export_maps_untrusted_keys_and_defaults_to_inventory(
    tmp_path, monkeypatch
):
    from ops.restore import export_snapshot

    monkeypatch.setattr("ops.restore.ROOT", tmp_path)
    repository = TestRepository(MemoryStore())
    path = tmp_path / "input"
    path.write_bytes(b"unchanged PDF bytes")
    payload = repository.payload(path)
    repository.complete(
        {
            "format": 1,
            "id": "export-example",
            "kind": "daily",
            "commit": "a" * 40,
            "created_at": datetime.now(UTC).isoformat(),
            "inventory": {"postgres_major": 18},
            "database": payload,
            "objects": [{"key": "../../outside.pdf", "payload": payload}],
        }
    )
    assert export_snapshot(repository, "export-example")["objects"] == 1
    assert not (tmp_path / ".local").exists()
    with pytest.raises(OpsError, match="new private"):
        export_snapshot(repository, "export-example", tmp_path / "outside")
    destination = tmp_path / ".local" / "backups" / "restore-example"
    export_snapshot(repository, "export-example", destination)
    assert (destination / "RESTORE_COMPLETE.json").is_file()
    assert (destination / "objects/00000000.bin").read_bytes() == path.read_bytes()
    assert not (tmp_path / ".local" / "outside.pdf").exists()


@pytest.mark.parametrize(
    "change",
    [
        {},
        {"commit": "b" * 40},
        {"read_only": True},
        {"operations_enabled": False},
        {"status": "unavailable"},
    ],
)
def test_operational_verification_requires_exact_runtime_and_maintenance_state(monkeypatch, change):
    from ops.release import operational_check

    token = "test-" + "a" * 64
    monkeypatch.setenv("DEPLOY_CHECK_TOKEN", token)
    record = {"status": "ok", "commit": "a" * 40, "operations_enabled": True, "read_only": False}
    with patch("ops.release.http_json", return_value={**record, **change}) as request:
        if change:
            with pytest.raises(OpsError, match="operational verification"):
                operational_check("https://example.test", "a" * 40, "db-id", read_only=False)
        else:
            assert (
                operational_check("https://example.test", "a" * 40, "db-id", read_only=False)
                == record
            )
        request.assert_called_once_with(
            "https://example.test/health/operations/",
            token=token,
            headers={"X-Operations-Database-ID": "db-id"},
            timeout=45,
        )


def test_missing_database_pdf_blocks_completion(monkeypatch, tmp_path):
    source = MemoryStore()
    source.project = "production"
    repository = TestRepository(MemoryStore())

    def export(url, path):
        path.write_bytes(b"dump")
        return {"referenced_pdfs": ["missing.pdf"]}

    monkeypatch.setattr("ops.snapshot.export_database", export)
    with pytest.raises(OpsError, match="missing"):
        create_snapshot("fictional", source, repository, kind="daily", commit="a" * 40)
    assert not repository.snapshots()
    with pytest.raises(OpsError, match="separate"):
        independent_stores(source, source)


def test_retention_keeps_shared_payload_and_seven_plus_five(tmp_path):
    store = MemoryStore()
    repository = TestRepository(store)
    path = tmp_path / "data"
    path.write_bytes(b"shared-file")
    shared = repository.payload(path)
    for index in range(10):
        for kind in ("daily", "predeploy"):
            repository.complete(
                {
                    "format": 1,
                    "id": f"{kind}-{index}",
                    "kind": kind,
                    "created_at": (datetime.now(UTC) - timedelta(days=10 - index)).isoformat(),
                    "database": shared,
                    "objects": [{"payload": shared}],
                }
            )
    repository.prune()
    kept = repository.snapshots()
    assert sum(row["kind"] == "daily" for row in kept) == 7
    assert sum(row["kind"] == "predeploy" for row in kept) == 5
    assert shared["parts"][0]["key"] in store.rows
    # Retention must not delete anything when a retained manifest is corrupt.
    manifest_key = kept[0]["manifest"]["key"]
    previous = store.rows[manifest_key]
    store.rows[manifest_key] = (b"corrupt", previous[1], previous[2])
    before = set(store.rows)
    with pytest.raises(OpsError, match="manifest"):
        repository.prune()
    assert set(store.rows) == before


def test_retention_rejects_completion_marker_pointing_at_payload(tmp_path):
    store = MemoryStore()
    repository = TestRepository(store)
    path = tmp_path / "input"
    path.write_bytes(b"important stored bytes")
    payload = repository.payload(path)
    # An insert-only writer cannot turn the pruner into an arbitrary-key deleter.
    record = {
        "id": "forged",
        "kind": "daily",
        "created_at": "2020-01-01T00:00:00+00:00",
        "manifest": payload["parts"][0],
    }
    store.put("snapshots/forged/complete.json", json.dumps(record).encode())
    before = set(store.rows)
    with pytest.raises(OpsError, match="completion"):
        repository.prune()
    assert set(store.rows) == before


@pytest.fixture
def maintenance(settings, db):
    settings.PRODUCTION_OPERATIONS_ENABLED = True
    settings.OPERATIONS_DATABASE_URL = ""
    settings.DEBUG = True
    state, _ = OperationsState.objects.get_or_create(pk=1)
    state.read_only = True
    state.operation_id = "test-operation"
    state.save()
    return state


def test_maintenance_preserves_reads_auth_and_blocks_all_mutations(maintenance, django_user_model):
    user = django_user_model.objects.create_user(
        username="backup-reader", password="Example-Strong-763!"
    )
    client = APIClient()
    client.force_authenticate(user)
    assert client.get("/api/v1/hymns/").status_code == 200
    for method, path in (
        ("post", "/api/v1/hymns/"),
        ("patch", "/api/v1/hymns/1/"),
        ("delete", "/api/v1/masses/1/"),
        ("post", "/admin/auth/user/add/"),
    ):
        response = getattr(client, method)(path, {}, format="json")
        assert response.status_code == 503
        assert response.json()["code"] == "maintenance_read_only"
        assert response["Retry-After"] == "30"
    auth = Client()
    assert (
        auth.post(
            "/api/v1/auth/login/",
            {"username": user.username, "password": "Example-Strong-763!"},
            content_type="application/json",
        ).status_code
        == 200
    )
    assert auth.post("/api/v1/auth/logout/", {}, content_type="application/json").status_code == 204
    with pytest.raises(CommandError, match="paused"):
        call_command("create_app_user", "blocked", role="User")


def test_operations_status_is_authenticated_and_redacts_admin_details(
    maintenance, django_user_model
):
    assert APIClient().get("/api/v1/operations/status/").status_code == 403
    api = APIClient()
    user = django_user_model.objects.create_user(username="ordinary-backup-reader")
    api.force_authenticate(user)
    body = api.get("/api/v1/operations/status/").json()
    assert body["read_only"] is True and "admin" not in body
    user.is_superuser = True
    user.save()
    body = api.get("/api/v1/operations/status/").json()
    assert body["admin"]["operation_id"] == "test-operation"
    assert body["admin"]["backup_stale"] is True
    assert not any(word in json.dumps(body) for word in ("password", "DATABASE_URL", "secret"))


def test_guard_rejects_missing_state_and_retains_lock_until_caller_finishes(maintenance):
    with pytest.raises(ReadOnlyError):
        with mutation_guard():
            pytest.fail("read-only guard admitted a mutation")
    maintenance.read_only = False
    maintenance.save()
    with mutation_guard():
        assert OperationsState.objects.get(pk=1).read_only is False
    maintenance.delete()
    with pytest.raises(ReadOnlyError):
        with mutation_guard():
            pytest.fail("missing state must fail closed")


@pytest.mark.parametrize(
    "change",
    [
        {"event": "pull_request"},
        {"conclusion": "failure"},
        {"head_branch": "feature"},
        {"head_repository": {"full_name": "attacker/fork"}},
    ],
)
def test_ci_gate_rejects_untrusted_or_failed_runs(change):
    run = {
        "name": "Application checks",
        "conclusion": "success",
        "event": "push",
        "head_branch": "main",
        "head_sha": "a" * 40,
        "repository": {"full_name": "owner/repo"},
        "head_repository": {"full_name": "owner/repo"},
    }
    validate_ci({"workflow_run": run}, "owner/repo", "a" * 40)
    run.update(change)
    with pytest.raises(OpsError):
        validate_ci({"workflow_run": run}, "owner/repo", "a" * 40)


@pytest.mark.django_db(transaction=True)
def test_drain_waits_for_existing_mutation_and_rejects_new_writer(settings):
    import threading
    import time

    from django.db import connection
    from ops.database import MUTATION_LOCK, Control, connect
    from psycopg.conninfo import make_conninfo

    OperationsState.objects.get_or_create(pk=1)
    values = connection.settings_dict
    url = make_conninfo(
        host=values["HOST"],
        port=values["PORT"],
        dbname=values["NAME"],
        user=values["USER"],
        password=values["PASSWORD"],
    )
    settings.PRODUCTION_OPERATIONS_ENABLED = True
    settings.OPERATIONS_DATABASE_URL = url
    settings.DEBUG = True
    drained, allow_finish = threading.Event(), threading.Event()
    errors = []

    def freeze():
        control = Control(url)
        try:
            with control.lock():
                control.begin("drain-test", "Taking a test snapshot")
                drained.set()
                if not allow_finish.wait(10):
                    raise RuntimeError("Test did not release the operation")
                control.finish()
        except BaseException as error:
            errors.append(error)
        finally:
            control.close()

    with connect(url) as original:
        original.execute("SELECT pg_advisory_lock_shared(%s)", [MUTATION_LOCK])
        worker = threading.Thread(target=freeze)
        worker.start()
        try:
            deadline = time.monotonic() + 10
            while not OperationsState.objects.get(pk=1).read_only and time.monotonic() < deadline:
                time.sleep(0.02)
            assert OperationsState.objects.get(pk=1).read_only
            assert not drained.is_set()
            with pytest.raises(ReadOnlyError):
                with mutation_guard():
                    pytest.fail("New writer bypassed the pending freeze")
            original.execute("SELECT pg_advisory_unlock_shared(%s)", [MUTATION_LOCK])
            assert drained.wait(10), "Existing mutation was not drained"
            assert OperationsState.objects.get(pk=1).read_only
        finally:
            allow_finish.set()
            worker.join(12)
        assert not worker.is_alive() and not errors
    assert not OperationsState.objects.get(pk=1).read_only


@pytest.mark.django_db(transaction=True)
def test_controller_persists_json_and_crash_state_and_refuses_wrong_owner():
    from django.db import connection
    from ops.database import Control
    from psycopg.conninfo import make_conninfo

    OperationsState.objects.get_or_create(pk=1)
    values = connection.settings_dict
    url = make_conninfo(
        host=values["HOST"],
        port=values["PORT"],
        dbname=values["NAME"],
        user=values["USER"],
        password=values["PASSWORD"],
    )
    control = Control(url)
    with control.lock():
        control.begin("interrupted-release", "Taking a snapshot")
        control.update(last_backup={"id": "verified", "objects": 2})
    control.close()  # Simulates losing the runner/connection, not an explicit recovery.
    resumed = Control(url)
    try:
        with resumed.lock():
            state = resumed.state()
            assert state["read_only"] and state["last_backup"] == {"id": "verified", "objects": 2}
            resumed.owner = "another-operation"
            with pytest.raises(OpsError, match="ownership"):
                resumed.finish()
            assert resumed.state()["read_only"]
            resumed.owner = "interrupted-release"
            resumed.finish()
            assert not resumed.state()["read_only"]
    finally:
        resumed.close()


@pytest.mark.parametrize(
    "phase,reviewed,allowed",
    [
        ("deploy_requested", False, False),
        ("deploying", False, False),
        ("verifying", True, True),
        ("snapshotting", False, True),
    ],
)
def test_recovery_requires_schema_review_after_possible_deployment(phase, reviewed, allowed):
    from unittest.mock import MagicMock

    from ops.release import recover

    control = FakeControl()
    control.fields.update(
        read_only=True, operation_id="correct-owner", phase=phase, deployment_id=""
    )
    with patch("ops.release.readiness", return_value={"commit": "a" * 40}):
        if allowed:
            recover(
                control,
                MagicMock(),
                "https://example.test",
                "correct-owner",
                schema_reviewed=reviewed,
            )
            assert "finish:recovered" in control.events
        else:
            with pytest.raises(OpsError, match="schema"):
                recover(
                    control,
                    MagicMock(),
                    "https://example.test",
                    "correct-owner",
                    schema_reviewed=reviewed,
                )
            assert not control.events


class FakeControl:
    owner = None

    def __init__(self):
        self.events = []
        self.fields = {
            "database_id": "matching",
            "last_restore": {"status": "passed", "created_at": datetime.now(UTC).isoformat()},
        }

    @contextmanager
    def lock(self):
        yield self

    def state(self):
        return self.fields

    def begin(self, identifier, reason, target):
        self.owner = identifier
        self.events.append("begin")

    def update(self, **fields):
        self.fields.update(fields)
        self.events.append(fields.get("phase", "update"))

    def finish(self, *, phase="idle"):
        self.events.append("finish:" + phase)


@pytest.mark.parametrize("failure", ["precheck", "backup", "trigger", "startup", "probe", "none"])
def test_release_failure_boundary_and_exact_commit(failure):
    from unittest.mock import MagicMock

    control, github, render, reader = FakeControl(), MagicMock(), MagicMock(), MagicMock()
    github.latest.return_value = "a" * 40
    render.trigger.return_value = {"id": "dep-example"}
    render.wait.return_value = "update_failed" if failure == "startup" else "live"
    reader.__enter__.return_value.execute.return_value.fetchone.return_value = ("matching",)
    with (
        patch("ops.release.connect", return_value=reader),
        patch("ops.release.readiness", return_value={"commit": "b" * 40}),
        patch("ops.release.create_snapshot", return_value={"id": "snapshot"}) as backup,
        patch("ops.release.operational_check") as probe,
    ):
        if failure == "backup":
            backup.side_effect = OpsError("export failed")
        if failure == "trigger":
            render.trigger.side_effect = OpsError("ambiguous network failure")
        if failure == "precheck":
            probe.side_effect = OpsError("precheck failed")
        if failure == "probe":
            probe.side_effect = [None, OpsError("failed")]
        if failure != "none":
            with pytest.raises(OpsError):
                run_operation(
                    control,
                    "reader",
                    None,
                    None,
                    deploy=True,
                    sha="a" * 40,
                    github=github,
                    render=render,
                    base="https://example.com",
                    run_id=1,
                )
        else:
            run_operation(
                control,
                "reader",
                None,
                None,
                deploy=True,
                sha="a" * 40,
                github=github,
                render=render,
                base="https://example.com",
                run_id=1,
            )
        if failure == "precheck":
            render.trigger.assert_not_called()
            backup.assert_not_called()
            assert control.events == []
        elif failure == "backup":
            render.trigger.assert_not_called()
            assert "finish:backup_failed" in control.events
        else:
            render.trigger.assert_called_once_with("a" * 40)
            assert ("finish:idle" in control.events) is (failure == "none")
            if failure != "none":
                assert not any(event.startswith("finish:") for event in control.events)
