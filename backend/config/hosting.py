"""Validated hosting options; database and S3 secrets stay on the server."""

import os
from urllib.parse import parse_qs, urlsplit

from botocore.config import Config
from django.core.exceptions import ImproperlyConfigured


def database_options(url: str, debug: bool) -> dict:
    """Bound connection waits and require TLS for remote production PostgreSQL."""
    parsed = urlsplit(url)
    options = {"connect_timeout": 10}
    if not debug and parsed.hostname not in {"localhost", "127.0.0.1", "::1", "db"}:
        sslmode = parse_qs(parsed.query).get("sslmode", ["require"])[0]
        if sslmode not in {"require", "verify-ca", "verify-full"}:
            raise ImproperlyConfigured("Hosted PostgreSQL requires SSL.")
        options["sslmode"] = sslmode
    return options


def storage_options() -> dict:
    """Use local uploads by default; S3 mode fails if configuration is incomplete."""
    storages = {
        "default": {"BACKEND": "django.core.files.storage.FileSystemStorage"},
        "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
    }
    backend = os.environ.get("DJANGO_STORAGE_BACKEND", "local")
    if backend == "local":
        return storages
    if backend != "s3":
        raise ImproperlyConfigured("DJANGO_STORAGE_BACKEND must be local or s3.")
    names = (
        "AWS_STORAGE_BUCKET_NAME",
        "AWS_S3_ENDPOINT_URL",
        "AWS_S3_REGION_NAME",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
    )
    if any(not os.environ.get(name) for name in names):
        raise ImproperlyConfigured("Supply all required private S3 settings.")
    if urlsplit(os.environ["AWS_S3_ENDPOINT_URL"]).scheme != "https":
        raise ImproperlyConfigured("Private S3 storage requires an HTTPS endpoint.")
    storages["default"] = {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": os.environ["AWS_STORAGE_BUCKET_NAME"],
            "endpoint_url": os.environ["AWS_S3_ENDPOINT_URL"],
            "region_name": os.environ["AWS_S3_REGION_NAME"],
            "access_key": os.environ["AWS_ACCESS_KEY_ID"],
            "secret_key": os.environ["AWS_SECRET_ACCESS_KEY"],
            "default_acl": None,
            "file_overwrite": False,
            "addressing_style": "path",
            "signature_version": "s3v4",
            "querystring_auth": True,
            "client_config": Config(
                connect_timeout=5, read_timeout=20, retries={"max_attempts": 1, "mode": "standard"}
            ),
        },
    }
    return storages
