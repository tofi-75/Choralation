"""Hosted persistence gates and private storage diagnostics, using isolated data."""

from io import BytesIO, StringIO
from unittest.mock import Mock, patch

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from django.core.exceptions import ImproperlyConfigured
from django.core.files.storage import FileSystemStorage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from rest_framework.test import APIClient
from storages.backends.s3 import S3Storage

from config.hosting import storage_options
from hymns.models import Hymn, Language, MassPlacement
from hymns.services import save_hymn
from hymns.storage_checks import StorageCheckFailed, attachment_status, check_storage


@pytest.mark.parametrize(
    "indicator", ["RENDER", "RENDER_EXTERNAL_HOSTNAME", "DJANGO_REQUIRE_DURABLE_STORAGE"]
)
@pytest.mark.parametrize("backend", [None, "local"])
def test_hosted_cannot_fall_back_to_local(monkeypatch, indicator, backend):
    for key in [
        "RENDER",
        "RENDER_EXTERNAL_HOSTNAME",
        "DJANGO_REQUIRE_DURABLE_STORAGE",
        "DJANGO_STORAGE_BACKEND",
    ]:
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv(indicator, "test.onrender.com" if indicator.endswith("HOSTNAME") else "true")
    if backend:
        monkeypatch.setenv("DJANGO_STORAGE_BACKEND", backend)
    with pytest.raises(ImproperlyConfigured, match="ephemeral"):
        storage_options()


def test_local_development_remains_local(monkeypatch):
    for name in [
        "DJANGO_STORAGE_BACKEND",
        "RENDER",
        "RENDER_EXTERNAL_HOSTNAME",
        "DJANGO_REQUIRE_DURABLE_STORAGE",
    ]:
        monkeypatch.delenv(name, raising=False)
    assert storage_options()["default"]["BACKEND"].endswith("FileSystemStorage")


@pytest.mark.parametrize(
    "endpoint",
    [
        "http://example.test",
        "https://user:password@example.test",
        "https://example.test?token=secret",
        "https://",
    ],
)
def test_invalid_storage_endpoints_are_rejected(monkeypatch, endpoint):
    values = {
        "DJANGO_STORAGE_BACKEND": "s3",
        "AWS_STORAGE_BUCKET_NAME": "sheet-music",
        "AWS_S3_ENDPOINT_URL": endpoint,
        "AWS_S3_REGION_NAME": "test",
        "AWS_ACCESS_KEY_ID": "fictional",
        "AWS_SECRET_ACCESS_KEY": "fictional",
    }
    for name, value in values.items():
        monkeypatch.setenv(name, value)
    with pytest.raises(ImproperlyConfigured, match="HTTPS"):
        storage_options()


def fake_s3():
    storage = Mock(spec=S3Storage)
    files = {}

    def save(name, file):
        files[name] = file.read()
        return name

    storage.save.side_effect = save
    storage.open.side_effect = lambda name, mode: BytesIO(files[name])
    storage.delete.side_effect = lambda name: files.pop(name, None)
    return storage, files


def test_canary_uses_only_unique_owned_keys_and_cleans_up():
    storage, files = fake_s3()
    files["sheet-music/existing.pdf"] = b"private original"
    check_storage(storage)
    check_storage(storage)
    assert files == {"sheet-music/existing.pdf": b"private original"}
    names = [call.args[0] for call in storage.save.call_args_list]
    assert len(set(names)) == 2
    assert all(name.startswith("_deployment-checks/") and name.endswith(".pdf") for name in names)
    assert [call.args[0] for call in storage.delete.call_args_list] == names


@pytest.mark.parametrize("failure", ["write", "read", "corrupt", "delete"])
def test_preflight_fails_safely_and_does_not_report_provider_secrets(failure):
    storage, files = fake_s3()
    secret = "private-provider-secret-and-object-name"
    if failure == "write":
        storage.save.side_effect = EndpointConnectionError(endpoint_url=secret)
    elif failure == "read":
        storage.open.side_effect = ClientError(
            {"Error": {"Code": "AccessDenied", "Message": secret}}, "GetObject"
        )
    elif failure == "corrupt":
        storage.open.side_effect = lambda *args: BytesIO(b"different content")
    else:
        storage.delete.side_effect = OSError(secret)
    with pytest.raises(StorageCheckFailed) as error:
        check_storage(storage)
    assert secret not in str(error.value)
    storage.delete.assert_called_once()
    assert not files or failure == "delete"


def test_preflight_rejects_filesystem_and_command_is_sanitized():
    with pytest.raises(StorageCheckFailed, match="not durable"):
        check_storage(FileSystemStorage())
    with patch(
        "hymns.management.commands.check_storage.check_storage",
        side_effect=StorageCheckFailed("Sanitized failure"),
    ):
        with pytest.raises(CommandError, match="Sanitized failure"):
            call_command("check_storage")
    with patch("hymns.management.commands.check_storage.check_storage"):
        out = StringIO()
        call_command("check_storage", stdout=out)
        assert "write, readback and cleanup passed" in out.getvalue()


def test_preflight_stops_startup_before_migrations_or_gunicorn(monkeypatch):
    import config.deployment as deployment

    order = []

    def fail():
        order.append("storage")
        raise RuntimeError("Storage not ready")

    monkeypatch.setattr(deployment, "prepare_storage", fail)
    monkeypatch.setattr(deployment, "prepare_database", lambda: order.append("migration"))
    monkeypatch.setattr(deployment.os, "execvp", lambda *args: order.append("serve"))
    with pytest.raises(RuntimeError, match="not ready"):
        deployment.start()
    assert order == ["storage"]


@pytest.mark.parametrize(
    "error",
    [
        ClientError({"Error": {"Code": "AccessDenied"}}, "HeadObject"),
        EndpointConnectionError(endpoint_url="https://private.test"),
    ],
)
def test_audit_distinguishes_inaccessible_from_missing(error):
    storage = Mock()
    storage.exists.side_effect = error
    assert attachment_status(storage, "private.pdf") == "inaccessible"
    storage.exists.side_effect = None
    storage.exists.return_value = False
    assert attachment_status(storage, "private.pdf") == "missing"


@pytest.mark.django_db
def test_audit_is_admin_only_includes_private_rows_and_hides_storage_keys(
    settings, django_user_model
):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    admin = django_user_model.objects.create_user(username="audit-admin", is_superuser=True)
    member = django_user_model.objects.create_user(username="audit-member")
    language = Language.objects.create(name="Audit", slug="audit")
    for i in range(4):
        Hymn.all_objects.create(
            title=f"Private audit {i}",
            language=language,
            created_by=member,
            publication_status="private",
            sheet_music_pdf=f"sheet-music/private-key-{i}.pdf",
            sheet_music_pdf_name="original.pdf",
        )
    api = APIClient()
    assert api.get("/api/v1/hymns/attachment-audit/").status_code == 403
    api.force_authenticate(member)
    assert api.get("/api/v1/hymns/attachment-audit/").status_code == 403
    api.force_authenticate(admin)
    storage = Mock()
    storage.exists.side_effect = [True, False, OSError("private transport info"), True]
    with patch("hymns.storage_checks.audit_storage", return_value=(storage, "s3")):
        response = api.get("/api/v1/hymns/attachment-audit/")
        assert response.status_code == 200
        assert response.data["count"] == 4 and response.data["next"]
        assert response.data["storage_backend"] == "s3"
        assert [r["status"] for r in response.data["results"]] == [
            "present",
            "missing",
            "inaccessible",
        ]
        assert "private-key" not in str(response.data) and "transport info" not in str(
            response.data
        )
        assert (
            api.get("/api/v1/hymns/attachment-audit/?page=2").data["results"][0]["status"]
            == "present"
        )
        assert api.get("/api/v1/hymns/attachment-audit/?page_size=1000").status_code == 400


@pytest.mark.django_db
@pytest.mark.parametrize("failure", ["upload", "database"])
def test_failed_replacement_preserves_original_and_only_cleans_new_upload(
    settings, tmp_path, django_user_model, failure
):
    from common.storage import StorageUnavailable

    settings.MEDIA_ROOT = tmp_path
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    admin = django_user_model.objects.create_user(username="replace-admin", is_superuser=True)
    language = Language.objects.create(name="Replace", slug="replace")
    placement = MassPlacement.objects.create(name="Replace", slug="replace")
    hymn = save_hymn(
        {
            "title": "Keep original",
            "language_id": language.pk,
            "placement_ids": [placement.pk],
            "is_season_neutral": True,
            "sheet_music_pdf": SimpleUploadedFile("original.pdf", b"%PDF-1.4\noriginal\n%%EOF"),
        },
        admin,
    )
    old = hymn.sheet_music_pdf.name
    storage = hymn.sheet_music_pdf.storage
    upload = {
        "sheet_music_pdf": SimpleUploadedFile("replacement.pdf", b"%PDF-1.4\nreplacement\n%%EOF")
    }
    if failure == "upload":
        with (
            patch.object(
                storage,
                "save",
                side_effect=EndpointConnectionError(endpoint_url="https://private.test"),
            ),
            patch.object(storage, "delete") as delete,
            pytest.raises(StorageUnavailable),
        ):
            save_hymn(upload, admin, hymn.pk)
        delete.assert_not_called()
    else:
        original_delete = storage.delete
        with (
            patch.object(Hymn, "save", side_effect=RuntimeError("DB write failed")),
            patch.object(storage, "delete", wraps=original_delete) as delete,
            pytest.raises(RuntimeError),
        ):
            save_hymn(upload, admin, hymn.pk)
        assert delete.call_count == 1 and delete.call_args.args[0] != old
    hymn.refresh_from_db()
    assert hymn.sheet_music_pdf.name == old
    with hymn.sheet_music_pdf.open("rb") as file:
        assert file.read() == b"%PDF-1.4\noriginal\n%%EOF"


@pytest.mark.django_db
def test_container_probe_session_and_csrf_contract(settings, django_user_model):
    from django.test import Client

    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    settings.DEBUG = False
    settings.SESSION_COOKIE_SECURE = True
    settings.CSRF_COOKIE_SECURE = True
    settings.SECURE_SSL_REDIRECT = True
    settings.SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    settings.ALLOWED_HOSTS = ["testserver"]
    user = django_user_model.objects.create_user(username="probe-session-check")
    client = Client(
        enforce_csrf_checks=True,
        HTTP_X_FORWARDED_PROTO="https",
        HTTP_ORIGIN="https://testserver",
        HTTP_HOST="testserver",
    )
    client.force_login(user, backend="accounts.backends.EmailOrUsernameBackend")
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf_token"]
    assert client.get("/api/v1/auth/me/").status_code == 200
    response = client.post("/api/v1/hymns/", {}, HTTP_X_CSRFTOKEN=csrf)
    assert response.status_code == 400, response.json()
