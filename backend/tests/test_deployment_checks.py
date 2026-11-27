"""Operational checks expose no content or account access; user flows stay isolated."""

import gzip
import hashlib
import io
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from uuid import uuid4

import pytest
from botocore.response import StreamingBody
from django.test import Client
from storages.backends.s3 import S3Storage

from common import deployment_checks as checks
from common.models import OperationsState
from hymns.models import Hymn, Language

TOKEN = "test-" + "a" * 64


@pytest.fixture
def probe(settings, db, monkeypatch):
    settings.DEPLOY_CHECK_TOKEN = TOKEN
    settings.PRODUCTION_OPERATIONS_ENABLED = True
    settings.OPERATIONS_DATABASE_URL = "postgresql://test:test@127.0.0.1/test"
    settings.APP_COMMIT_SHA = "a" * 40
    state, _ = OperationsState.objects.get_or_create(pk=1)
    guard, cursor = MagicMock(), MagicMock()
    guard.__enter__.return_value = guard
    guard.cursor.return_value.__enter__.return_value = cursor
    cursor.fetchone.side_effect = lambda: (
        (True,)
        if "pg_try_advisory" in cursor.execute.call_args.args[0]
        else (state.read_only, state.database_id)
    )
    connect = MagicMock(return_value=guard)
    monkeypatch.setattr(checks, "psycopg", SimpleNamespace(connect=connect))
    return state, cursor, connect


def call_probe(state, **kwargs):
    return Client().get(
        "/health/operations/",
        secure=True,
        HTTP_AUTHORIZATION="Bearer " + TOKEN,
        HTTP_X_OPERATIONS_DATABASE_ID=str(state.database_id),
        **kwargs,
    )


@pytest.mark.parametrize("authorization", [None, "", "Bearer wrong", TOKEN, "Bearer é"])
def test_invalid_credentials_cannot_trigger_database_or_storage_checks(settings, authorization):
    settings.DEPLOY_CHECK_TOKEN = TOKEN
    headers = {"HTTP_AUTHORIZATION": authorization} if authorization is not None else {}
    with (
        patch.object(checks, "check_database") as database,
        patch.object(checks, "check_pdf_storage") as storage,
    ):
        response = Client().get("/health/operations/", secure=True, **headers)
    assert response.status_code == 403 and response.json() == {"status": "forbidden"}
    assert response["Cache-Control"] == "no-store"
    assert "Authorization" in response["Vary"]
    database.assert_not_called()
    storage.assert_not_called()


def test_operational_token_grants_no_application_session_and_no_write_method(settings):
    settings.DEPLOY_CHECK_TOKEN = TOKEN
    settings.PRODUCTION_OPERATIONS_ENABLED = False
    client = Client()
    assert (
        client.get("/api/v1/hymns/", secure=True, HTTP_AUTHORIZATION="Bearer " + TOKEN).status_code
        == 403
    )
    assert (
        client.post(
            "/health/operations/", secure=True, HTTP_AUTHORIZATION="Bearer " + TOKEN
        ).status_code
        == 405
    )
    assert "sessionid" not in client.cookies


@pytest.mark.parametrize("read_only", [False, True])
def test_probe_checks_real_schema_and_guard_in_idle_and_maintenance(probe, read_only):
    state, cursor, connect = probe
    state.read_only = read_only
    state.save()
    with patch.object(checks, "check_pdf_storage") as storage:
        response = call_probe(state)
    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "commit": "a" * 40,
        "operations_enabled": True,
        "read_only": read_only,
    }
    assert "database_id" not in response.content.decode()
    assert "no-store" in response["Cache-Control"]
    assert cursor.execute.call_args.args[0] == "SELECT pg_advisory_unlock_shared(%s)"
    connect.assert_called_once()
    storage.assert_called_once()


def test_probe_cannot_guard_or_release_a_different_database(probe):
    state, cursor, connect = probe
    response = Client().get(
        "/health/operations/",
        secure=True,
        HTTP_AUTHORIZATION="Bearer " + TOKEN,
        HTTP_X_OPERATIONS_DATABASE_ID=str(uuid4()),
    )
    assert response.status_code == 503
    connect.assert_not_called()
    cursor.fetchone.side_effect = [(True,), (False, uuid4())]
    assert call_probe(state).status_code == 503
    assert cursor.execute.call_args.args[0] == "SELECT pg_advisory_unlock_shared(%s)"


def test_pending_migrations_and_guard_lock_failure_block_probe(probe):
    state, cursor, connect = probe
    with patch.object(checks.MigrationExecutor, "migration_plan", return_value=["pending"]):
        assert call_probe(state).status_code == 503
    connect.assert_not_called()
    cursor.fetchone.side_effect = [(False,)]
    assert call_probe(state).status_code == 503
    assert not any("pg_advisory_unlock" in c.args[0] for c in cursor.execute.call_args_list)


def test_provider_details_and_record_paths_never_leave_probe(probe):
    state, _, _ = probe
    with patch.object(
        checks, "check_pdf_storage", side_effect=OSError("private bucket/path secret")
    ):
        response = call_probe(state)
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "private" not in response.content.decode()


@pytest.mark.parametrize("encoding", ["identity", "gzip"])
def test_storage_probe_reads_existing_pdf_bounded_without_changing_records(settings, db, encoding):
    pdf = (
        Path(__file__).resolve().parents[2] / "frontend/tests/fixtures/sheet-music.pdf"
    ).read_bytes()
    data = gzip.compress(pdf, mtime=0) if encoding == "gzip" else pdf
    language = Language.objects.create(name="Check", slug="check")
    hymn = Hymn.objects.create(
        title="Existing PDF",
        language=language,
        sheet_music_pdf="existing.pdf",
        sheet_music_pdf_encoding=encoding,
        sheet_music_pdf_size=len(pdf),
        sheet_music_pdf_sha256=hashlib.sha256(pdf).hexdigest(),
    )
    storage = MagicMock(spec=S3Storage)
    storage.bucket_name = "private-bucket"
    storage._normalize_name.return_value = "existing.pdf"
    storage.connection.meta.client.get_object.return_value = {
        "Body": StreamingBody(io.BytesIO(data), len(data))
    }
    before = list(Hymn.all_objects.values())
    with patch.object(checks, "audit_storage", return_value=(storage, "s3")):
        checks.check_pdf_storage()
    assert list(Hymn.all_objects.values()) == before
    storage.connection.meta.client.get_object.assert_called_once_with(
        Bucket="private-bucket",
        Key=hymn.sheet_music_pdf.name,
        Range=f"bytes=0-{checks.MAX_STORED_BYTES}",
    )
    storage.save.assert_not_called()
    storage.delete.assert_not_called()


def test_empty_pdf_library_and_ephemeral_storage_cannot_pass(db):
    with pytest.raises(checks.CheckFailed):
        checks.check_pdf_storage()
    language = Language.objects.create(name="Check", slug="check")
    Hymn.objects.create(title="Existing", language=language, sheet_music_pdf="existing.pdf")
    with (
        patch.object(checks, "audit_storage", return_value=(object(), "local")),
        pytest.raises(checks.CheckFailed),
    ):
        checks.check_pdf_storage()


def test_member_login_mass_pdf_and_denied_edits_in_disposable_test_database(
    settings, db, django_user_model, tmp_path
):
    from choir_fixtures import choir_client, choir_member
    from django.core.files.uploadedfile import SimpleUploadedFile

    from masses.models import Mass

    settings.MEDIA_ROOT = tmp_path
    settings.PRODUCTION_OPERATIONS_ENABLED = False
    user = django_user_model.objects.create_user(
        username="isolated-member", password="Isolated-Strong-762!"
    )
    membership = choir_member(user)
    language = Language.objects.create(name="Isolated", slug="isolated")
    pdf = b"%PDF-1.4\nIsolated check\n%%EOF"
    hymn = Hymn.objects.create(
        title="Isolated",
        language=language,
        created_by=user,
        sheet_music_pdf=SimpleUploadedFile("test.pdf", pdf),
    )
    mass = Mass.objects.create(choir=membership.choir, date="2026-11-27", title="Isolated")
    client = choir_client(enforce_csrf_checks=True)
    csrf = client.get("/api/v1/auth/csrf/").data["csrf_token"]
    assert (
        client.post(
            "/api/v1/auth/login/",
            {"username": user.username, "password": "Isolated-Strong-762!"},
            format="json",
            HTTP_X_CSRFTOKEN=csrf,
        ).status_code
        == 200
    )
    assert client.get(f"/api/v1/masses/{mass.pk}/").status_code == 200
    assert client.get(f"/api/v1/hymns/{hymn.pk}/").status_code == 200
    response = client.get(f"/api/v1/hymns/{hymn.pk}/sheet-music/")
    assert b"".join(response.streaming_content) == pdf
    csrf = client.get("/api/v1/auth/csrf/").data["csrf_token"]
    assert client.delete(f"/api/v1/masses/{mass.pk}/", HTTP_X_CSRFTOKEN=csrf).status_code == 403
    assert (
        client.post("/api/v1/auth/logout/", {}, format="json", HTTP_X_CSRFTOKEN=csrf).status_code
        == 204
    )
    assert choir_client().get(f"/api/v1/hymns/{hymn.pk}/sheet-music/").status_code in {401, 403}
