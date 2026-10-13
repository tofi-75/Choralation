"""Hosting contracts: production routing, TLS, private storage and safe startup."""

import importlib
import importlib.util
import subprocess
from io import StringIO
from pathlib import Path
from unittest.mock import patch

import pytest
from botocore.exceptions import ClientError, EndpointConnectionError
from django.contrib.auth.models import Group
from django.core.exceptions import ImproperlyConfigured
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, override_settings
from django.urls import clear_url_caches
from rest_framework.test import APIClient

from config.deployment import prepare_database
from config.environment import read_environment
from config.hosting import database_options, storage_options
from hymns.models import Hymn, Language, MassPlacement


@pytest.fixture
def production_routes(settings, tmp_path):
    assets = tmp_path / "assets"
    assets.mkdir()
    (assets / "app-12345678.js").write_text("console.log('built');")
    (tmp_path / "index.html").write_text(
        '<div id="root"></div><script src="/assets/app-12345678.js"></script>'
    )
    import config.urls

    with override_settings(
        SERVE_FRONTEND=True,
        FRONTEND_ROOT=tmp_path,
        DEBUG=False,
        SECURE_SSL_REDIRECT=True,
        SECURE_PROXY_SSL_HEADER=("HTTP_X_FORWARDED_PROTO", "https"),
        MIDDLEWARE=[
            "django.middleware.security.SecurityMiddleware",
            "common.frontend.FrontendStaticMiddleware",
            *[
                middleware
                for middleware in settings.MIDDLEWARE
                if middleware
                not in {
                    "django.middleware.security.SecurityMiddleware",
                    "whitenoise.middleware.WhiteNoiseMiddleware",
                    "common.frontend.FrontendStaticMiddleware",
                }
            ],
        ],
        STATIC_ROOT=tmp_path / "static",
    ):
        (tmp_path / "static").mkdir()
        importlib.reload(config.urls)
        clear_url_caches()
        yield Client(HTTP_X_FORWARDED_PROTO="https")
    importlib.reload(config.urls)
    clear_url_caches()


@pytest.mark.parametrize(
    "path",
    [
        "/",
        "/login",
        "/dashboard",
        "/history",
        "/hymns",
        "/hymns/new",
        "/hymns/94/edit",
        "/masses/new",
        "/masses/164/edit",
    ],
)
def test_named_pages_can_be_refreshed_over_proxy_https(production_routes, path):
    response = production_routes.get(path)
    assert response.status_code == 200
    assert b'id="root"' in response.content
    assert response["Cache-Control"] == "no-cache"


@pytest.mark.parametrize(
    "path",
    [
        "/api/missing/",
        "/health/missing/",
        "/assets/missing.js",
        "/static/missing.css",
        "/media/private.pdf",
        "/.env",
        "/missing.pdf",
    ],
)
def test_reserved_paths_never_receive_spa(production_routes, path):
    response = production_routes.get(path)
    assert response.status_code == 404
    assert b'id="root"' not in response.content


def test_assets_are_served_with_immutable_cache(production_routes):
    response = production_routes.get("/assets/app-12345678.js")
    assert response.status_code == 200
    assert "immutable" in response["Cache-Control"]
    assert "text/html" not in response["Content-Type"]


def test_html_post_is_rejected_and_http_redirects(production_routes):
    assert production_routes.post("/login").status_code == 405
    response = Client().get("/login")
    assert response.status_code == 301
    assert response["Location"].startswith("https://")


@pytest.mark.parametrize(
    "url",
    [
        "postgresql://user:password@remote.example/db",
        "postgresql://user:password@remote.example/db?sslmode=verify-full",
    ],
)
def test_remote_production_database_requires_tls(url):
    assert database_options(url, False)["sslmode"] in {"require", "verify-full"}
    assert database_options(url, False)["connect_timeout"] == 10


def test_remote_database_cannot_disable_tls():
    with pytest.raises(ImproperlyConfigured, match="SSL"):
        database_options("postgresql://user:password@remote.example/db?sslmode=disable", False)


def test_storage_configuration_is_private_and_requires_complete_settings(monkeypatch):
    monkeypatch.setenv("DJANGO_STORAGE_BACKEND", "s3")
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    with pytest.raises(ImproperlyConfigured, match="S3"):
        storage_options()
    for key, value in {
        "AWS_STORAGE_BUCKET_NAME": "sheet-music",
        "AWS_S3_ENDPOINT_URL": "https://example.supabase.co/storage/v1/s3",
        "AWS_S3_REGION_NAME": "eu-central-1",
        "AWS_ACCESS_KEY_ID": "test-access",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
    }.items():
        monkeypatch.setenv(key, value)
    options = storage_options()["default"]["OPTIONS"]
    assert options["default_acl"] is None
    assert options["addressing_style"] == "path"
    assert options["file_overwrite"] is False
    assert options["querystring_auth"] is True
    assert options["client_config"].connect_timeout == 5


def test_startup_stops_on_failed_migration_and_replays_in_order():
    calls = []

    def run(arguments, **kwargs):
        calls.append(arguments[2])

    prepare_database(run)
    prepare_database(run)
    assert calls == ["migrate", "provision_roles", "seed_initial_data"] * 2

    def fail(arguments, **kwargs):
        raise subprocess.CalledProcessError(1, arguments)

    with pytest.raises(subprocess.CalledProcessError):
        prepare_database(fail)


@pytest.mark.django_db
def test_hosted_demo_seeding_requires_both_opt_ins(settings, django_user_model):
    settings.DEBUG = False
    user = django_user_model.objects.create_user(username="hosted-demo")
    user.groups.add(Group.objects.get(name="Admin"))
    call_command("seed_initial_data", stdout=StringIO())
    settings.ALLOW_HOSTED_DEMO_DATA = False
    with pytest.raises(CommandError):
        call_command("seed_demo_data", username=user.username, allow_hosted=True)
    settings.ALLOW_HOSTED_DEMO_DATA = True
    with pytest.raises(CommandError):
        call_command("seed_demo_data", username=user.username)
    for _ in range(2):
        call_command("seed_demo_data", username=user.username, allow_hosted=True, stdout=StringIO())
    assert Hymn.objects.count() == 36


@pytest.mark.django_db
def test_cloud_storage_failures_are_retryable_without_partial_hymns(django_user_model):
    user = django_user_model.objects.create_user(username="storage-admin")
    user.groups.add(Group.objects.get(name="Admin"))
    language = Language.objects.create(name="Cloud", slug="cloud")
    placement = MassPlacement.objects.create(name="Cloud", slug="cloud")
    api = APIClient()
    api.force_authenticate(user)
    from common.storage import StorageUnavailable
    from hymns.services import save_hymn

    data = {
        "title": "Cloud test",
        "language_id": language.pk,
        "placement_ids": [placement.pk],
        "is_season_neutral": True,
        "sheet_music_pdf": SimpleUploadedFile("score.pdf", b"%PDF-1.4\n%%EOF"),
    }
    with (
        patch(
            "django.core.files.storage.FileSystemStorage.save",
            side_effect=EndpointConnectionError(endpoint_url="https://private-provider.example"),
        ),
        pytest.raises(StorageUnavailable),
    ):
        save_hymn(data, user)
    assert not Hymn.objects.filter(title="Cloud test").exists()
    hymn = Hymn.objects.create(
        title="Cloud test", language=language, is_season_neutral=True, sheet_music_pdf="private.pdf"
    )
    with patch(
        "django.db.models.fields.files.FieldFile.open",
        side_effect=ClientError(
            {"Error": {"Code": "AccessDenied", "Message": "sensitive-provider-details"}},
            "GetObject",
        ),
    ):
        response = api.get(f"/api/v1/hymns/{hymn.pk}/sheet-music/")
    assert response.status_code == 503
    assert response.data["code"] == "storage_unavailable"
    assert "sensitive-provider-details" not in str(response.data)


def test_hosted_helper_rejects_local_db_and_preserves_environment(monkeypatch, tmp_path):
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location("hosted_admin", root / "scripts/hosted-admin.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    monkeypatch.setattr(module, "ROOT", tmp_path)
    env_file = tmp_path / ".env.hosted"
    env_file.write_text("DATABASE_URL=postgresql://local:secret@127.0.0.1:55432/local\n")
    with pytest.raises(ValueError, match="session pooler"):
        module.hosted_environment(env_file)
    monkeypatch.setenv("DATABASE_URL", "postgresql://local:keep@localhost/local")
    values = {
        "DATABASE_URL": "postgresql://postgres.test:private@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require",
        "DJANGO_SECRET_KEY": "test-" * 15,
        "DJANGO_STORAGE_BACKEND": "s3",
        "AWS_STORAGE_BUCKET_NAME": "sheet-music",
        "AWS_S3_ENDPOINT_URL": "https://test.storage.supabase.co/storage/v1/s3",
        "AWS_S3_REGION_NAME": "eu-central-1",
        "AWS_ACCESS_KEY_ID": "test-key",
        "AWS_SECRET_ACCESS_KEY": "test-secret",
    }
    env_file.write_text("\n".join(f"{k}={v}" for k, v in values.items()))
    environment, host = module.hosted_environment(env_file)
    assert host.endswith(".pooler.supabase.com")
    assert environment["DATABASE_URL"] == values["DATABASE_URL"]
    assert environment["DJANGO_DEBUG"] == "false"
    import os

    assert os.environ["DATABASE_URL"] == "postgresql://local:keep@localhost/local"
    assert read_environment(env_file)["AWS_SECRET_ACCESS_KEY"] == "test-secret"


def test_render_settings_derive_host_and_keep_secure_cookies():
    import json
    import os
    import sys

    environment = os.environ.copy()
    environment.update(
        {
            "DJANGO_DEBUG": "false",
            "DJANGO_STORAGE_BACKEND": "local",
            "RENDER_EXTERNAL_HOSTNAME": "choralation-test.onrender.com",
            "DJANGO_TRUST_PROXY_HTTPS": "true",
        }
    )
    code = "import json; from config import settings as s; print(json.dumps([s.ALLOWED_HOSTS, s.CSRF_TRUSTED_ORIGINS, s.SECURE_PROXY_SSL_HEADER, s.SESSION_COOKIE_SECURE, s.CSRF_COOKIE_SECURE]))"
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        capture_output=True,
        text=True,
        check=True,
    )
    hosts, origins, proxy, session_secure, csrf_secure = json.loads(result.stdout)
    assert "choralation-test.onrender.com" in hosts
    assert "https://choralation-test.onrender.com" in origins
    assert proxy == ["HTTP_X_FORWARDED_PROTO", "https"]
    assert session_secure and csrf_secure


@pytest.mark.django_db
def test_production_login_csrf_and_private_pdf_survive_new_client(
    settings, django_user_model, tmp_path
):
    import json

    settings.MEDIA_ROOT = tmp_path / "production-media"
    settings.DEBUG = False
    settings.SESSION_COOKIE_SECURE = True
    settings.CSRF_COOKIE_SECURE = True
    settings.SECURE_SSL_REDIRECT = True
    settings.CSRF_TRUSTED_ORIGINS = ["https://testserver"]
    user = django_user_model.objects.create_user(
        username="production-planner", password="Strong-Hosting-Password-692!"
    )
    user.groups.add(Group.objects.get(name="Planner"))
    language = Language.objects.create(name="Production", slug="production")
    placement = MassPlacement.objects.create(name="Production", slug="production")
    api = APIClient(enforce_csrf_checks=True, HTTP_ORIGIN="https://testserver")
    csrf = api.get("/api/v1/auth/csrf/", secure=True)
    token = csrf.data["csrf_token"]
    assert csrf.cookies["csrftoken"]["secure"]
    response = api.post(
        "/api/v1/auth/login/",
        {"username": user.username, "password": "Strong-Hosting-Password-692!"},
        format="json",
        secure=True,
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 200
    assert response.cookies["sessionid"]["secure"]
    token = api.get("/api/v1/auth/csrf/", secure=True).data["csrf_token"]
    payload = {
        "title": "Production upload",
        "language_id": language.pk,
        "placement_ids": [placement.pk],
        "is_season_neutral": True,
    }
    pdf = b"%PDF-1.4\nproduction-sheet\n%%EOF"
    response = api.post(
        "/api/v1/hymns/",
        {"data": json.dumps(payload), "sheet_music_pdf": SimpleUploadedFile("score.pdf", pdf)},
        format="multipart",
        secure=True,
        HTTP_X_CSRFTOKEN=token,
    )
    assert response.status_code == 201
    hymn_id = response.data["id"]
    # A new request client/server handler retains DB sessions and persisted files.
    resumed = APIClient(enforce_csrf_checks=True)
    resumed.cookies = api.cookies
    download = resumed.get(f"/api/v1/hymns/{hymn_id}/sheet-music/", secure=True)
    assert download.status_code == 200
    assert b"".join(download.streaming_content) == pdf
    assert download["Cache-Control"] == "no-store"
    assert APIClient().get(f"/api/v1/hymns/{hymn_id}/sheet-music/", secure=True).status_code == 403
    assert (
        resumed.patch(
            f"/api/v1/hymns/{hymn_id}/",
            {"title": "Must reject missing CSRF"},
            format="json",
            secure=True,
        ).status_code
        == 403
    )


def test_internal_readiness_does_not_mistake_redirect_for_health(settings, monkeypatch):
    from django.db import DatabaseError

    settings.SECURE_SSL_REDIRECT = True
    settings.SECURE_REDIRECT_EXEMPT = [r"^health/(?:live|ready)/$"]

    def unavailable():
        raise DatabaseError("sensitive connection information")

    monkeypatch.setattr("common.views.connection.cursor", unavailable)
    response = Client().get("/health/ready/")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert "sensitive" not in response.content.decode()
    assert Client().get("/login").status_code == 301


@pytest.mark.parametrize("length, allowed", [(0, False), (44, False), (87, True)])
def test_runtime_secret_validation_before_migrations(length, allowed):
    import os
    import secrets
    import sys

    environment = os.environ.copy()
    environment.update(
        {
            "DJANGO_SECRET_KEY": secrets.token_urlsafe(80)[:length],
            "DJANGO_DEBUG": "false",
            "DJANGO_STORAGE_BACKEND": "local",
            "DATABASE_URL": "postgresql://build:build@127.0.0.1/build",
        }
    )
    result = subprocess.run(
        [sys.executable, "-c", "from config import settings; print('settings loaded')"],
        cwd=Path(__file__).resolve().parents[1],
        env=environment,
        capture_output=True,
        text=True,
    )
    assert (result.returncode == 0) is allowed
    if not allowed:
        assert "at least 50 characters" in result.stderr
