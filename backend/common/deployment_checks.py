"""Token-protected, read-only release checks; no production test accounts or records."""

import re
import secrets
from uuid import UUID

import psycopg
from django.conf import settings
from django.db import connection
from django.db.migrations.executor import MigrationExecutor
from django.http import JsonResponse
from django.utils.cache import patch_vary_headers
from django.views.decorators.http import require_GET
from storages.backends.s3 import S3Storage

from common.operations import MUTATION_LOCK
from config.hosting import database_options
from hymns.pdf_storage import MAX_STORED_BYTES, decode_pdf
from hymns.storage_checks import audit_storage


class CheckFailed(Exception):
    pass


def valid_token(token):
    return isinstance(token, str) and bool(re.fullmatch(r"[A-Za-z0-9_-]{43,128}", token))


def check_database(expected_id):
    if not settings.PRODUCTION_OPERATIONS_ENABLED or not settings.OPERATIONS_DATABASE_URL:
        raise CheckFailed()
    executor = MigrationExecutor(connection)
    executor.loader.check_consistent_history(connection)
    if executor.migration_plan(executor.loader.graph.leaf_nodes()):
        raise CheckFailed()
    with connection.cursor() as cursor:
        cursor.execute("SELECT read_only, database_id FROM common_operationsstate WHERE id=1")
        state = cursor.fetchone()
    if not state or state[1] != UUID(expected_id):
        raise CheckFailed()
    # Exercise the dedicated session connection and the same shared advisory lock
    # used by content writes. Persistent maintenance may be true during deployment.
    url = settings.OPERATIONS_DATABASE_URL
    with (
        psycopg.connect(url, autocommit=True, **database_options(url, settings.DEBUG)) as guard,
        guard.cursor() as cursor,
    ):
        cursor.execute("SELECT pg_try_advisory_lock_shared(%s)", [MUTATION_LOCK])
        if not cursor.fetchone()[0]:
            raise CheckFailed()
        try:
            cursor.execute("SELECT read_only, database_id FROM common_operationsstate WHERE id=1")
            if cursor.fetchone() != state:
                raise CheckFailed()
        finally:
            cursor.execute("SELECT pg_advisory_unlock_shared(%s)", [MUTATION_LOCK])
    return state[0]


def check_pdf_storage():
    from hymns.models import Hymn
    from masses.models import Mass

    # Actual application queries and an existing uploaded PDF, without exposing
    # any record or adding a test choir/Mass/hymn. Empty PDF libraries fail closed.
    Mass.objects.exists()
    hymn = (
        Hymn.all_objects.filter(is_active=True, sheet_music_pdf__isnull=False)
        .exclude(sheet_music_pdf="")
        .only(
            "sheet_music_pdf",
            "sheet_music_pdf_encoding",
            "sheet_music_pdf_size",
            "sheet_music_pdf_sha256",
        )
        .order_by("sheet_music_pdf_size", "pk")
        .first()
    )
    if hymn is None:
        raise CheckFailed()
    storage, kind = audit_storage()
    if kind != "s3" or not isinstance(storage, S3Storage):
        raise CheckFailed()
    response = storage.connection.meta.client.get_object(
        Bucket=storage.bucket_name,
        Key=storage._normalize_name(hymn.sheet_music_pdf.name),
        Range=f"bytes=0-{MAX_STORED_BYTES}",
    )
    with response["Body"] as stream:
        stored = stream.read(MAX_STORED_BYTES + 1)
    # Uses the same bounded gzip/PDF/size/checksum validation as hymn downloads.
    decode_pdf(hymn, stored)


def reply(body, status=200):
    response = JsonResponse(body, status=status)
    response["Cache-Control"] = "no-store"
    patch_vary_headers(response, ("Authorization",))
    return response


@require_GET
def deployment_check(request):
    token = settings.DEPLOY_CHECK_TOKEN
    supplied = request.headers.get("Authorization", "").removeprefix("Bearer ")
    if (
        not valid_token(token)
        or not request.headers.get("Authorization", "").startswith("Bearer ")
        or not secrets.compare_digest(supplied.encode(), token.encode())
    ):
        return reply({"status": "forbidden"}, 403)
    try:
        read_only = check_database(request.headers.get("X-Operations-Database-ID", ""))
        check_pdf_storage()
    except Exception:
        # No provider messages, filenames, identities, URLs or tracebacks are sent
        # to the runner. Failures keep a post-request release in maintenance.
        return reply({"status": "unavailable"}, 503)
    return reply(
        {
            "status": "ok",
            "commit": settings.APP_COMMIT_SHA,
            "operations_enabled": True,
            "read_only": read_only,
        }
    )
