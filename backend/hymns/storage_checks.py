"""Private, bounded storage diagnostics; never return provider secrets or file contents."""

import secrets
from uuid import uuid4

from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.storage import storages
from storages.backends.s3 import S3Storage


class StorageCheckFailed(Exception):
    pass


def check_storage(storage=None):
    storage = storages["default"] if storage is None else storage
    if not isinstance(storage, S3Storage):
        raise StorageCheckFailed("Hosted PDF storage must use S3; local files are not durable.")
    name = f"_deployment-checks/{uuid4().hex}.pdf"
    payload = b"%PDF-1.4\n% Storage check " + secrets.token_hex(16).encode() + b"\n%%EOF\n"
    failure = None
    try:
        # A unique run-owned key; no existing attachment is ever touched.
        name = storage.save(name, ContentFile(payload))
        with storage.open(name, "rb") as handle:
            if handle.read(len(payload) + 1) != payload:
                raise StorageCheckFailed("Storage content verification failed.")
    except Exception:
        failure = (
            "Private PDF storage write/read check failed. Check the S3 target and credentials."
        )
    finally:
        try:
            storage.delete(name)
        except Exception:
            failure = "Storage preflight cleanup failed. Check S3 delete permission."
    if failure:
        raise StorageCheckFailed(failure) from None


def audit_storage():
    """Separate short-timeout connections keep the Admin audit below HTTP deadlines."""
    config = settings.STORAGES["default"]
    if config["BACKEND"] != "storages.backends.s3.S3Storage":
        return storages["default"], "local"
    options = dict(config.get("OPTIONS", {}))
    options["client_config"] = options.get("client_config", Config()).merge(
        Config(connect_timeout=1, read_timeout=2, retries={"max_attempts": 0})
    )
    return storages.create_storage({**config, "OPTIONS": options}), "s3"


def attachment_status(storage, name):
    try:
        return "present" if storage.exists(name) else "missing"
    except (BotoCoreError, ClientError, OSError):
        return "inaccessible"
