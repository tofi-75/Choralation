"""Real age + PostgreSQL dump/restore + private TLS S3, in its dedicated Linux CI job."""

import gzip
import os
import secrets
import subprocess
from pathlib import Path

import pytest
from django.db import connection
from ops.core import digest, process
from ops.database import connect, pg_environment
from ops.restore import rehearse
from ops.snapshot import create_snapshot
from ops.storage import Repository
from psycopg import sql
from psycopg.conninfo import make_conninfo
from test_supabase_storage import storage_api as storage_api
from test_supabase_storage import storage_http_api as storage_http_api

pytestmark = [
    pytest.mark.django_db(transaction=True),
    pytest.mark.skipif(
        os.environ.get("RUN_BACKUP_INTEGRATION") != "true",
        reason="Real crypto/container acceptance runs in the separate operations CI job",
    ),
]


def test_encrypted_database_and_pdf_snapshot_restores_matching_application(
    tmp_path, django_user_model, storage_http_api
):
    from django.utils import timezone

    from accounts.models import AccountProfile
    from choirs.models import Choir, Membership
    from hymns.models import Hymn, Language, MassPlacement
    from masses.models import Mass, MassHymnSelection

    owner = django_user_model.objects.create_user(username="restore-only", is_superuser=True)
    AccountProfile.objects.create(user=owner, username_key=owner.username, can_create_choirs=True)
    choir = Choir.objects.create(name="Restore rehearsal choir")
    Membership.objects.create(user=owner, choir=choir, role="Leader")
    planner = django_user_model.objects.create_user(username="restore-planner")
    Membership.objects.create(user=planner, choir=choir, role="Planner")
    member = django_user_model.objects.create_user(username="restore-member")
    Membership.objects.create(user=member, choir=choir, role="Member")
    language = Language.objects.create(name="Restore language", slug="restore-language")
    placement = MassPlacement.objects.create(name="Restore placement", slug="restore-placement")
    source = storage_http_api.store("reader", source=True)
    destination = storage_http_api.store()
    pdf = (
        Path(__file__).resolve().parents[2] / "frontend/tests/fixtures/sheet-music.pdf"
    ).read_bytes()
    for index, data in enumerate((pdf, gzip.compress(pdf, mtime=0))):
        key = f"sheet-music/fixture-{index}.pdf" + (".gz" if index else "")
        storage_http_api.seed(
            "source1",
            "sheet-music",
            key,
            data,
            encoding="gzip" if index else "",
            metadata={"original-name": "fixture.pdf"},
        )
        hymn = Hymn.objects.create(
            title=f"Restore {index}",
            language=language,
            created_by=owner,
            sheet_music_pdf=key,
            sheet_music_pdf_name="fixture.pdf",
            sheet_music_pdf_encoding="gzip" if index else "identity",
            sheet_music_pdf_size=len(pdf),
            sheet_music_pdf_sha256=digest(pdf),
            publication_status="private" if index else "published",
        )
        hymn.placements.add(placement)
        if not index:
            published_hymn = hymn
        mass = Mass.objects.create(
            choir=choir,
            date="2026-11-21",
            title=f"Restore Mass {index}",
            created_by=planner,
            status="finalized" if index else "draft",
            finalized_at=timezone.now() if index else None,
        )
        MassHymnSelection.objects.create(
            mass=mass,
            hymn=published_hymn,
            placement=placement,
            position=0,
            notes="Keep this rehearsal note",
        )
    identity = tmp_path / "identity"
    subprocess.run(["age-keygen", "-o", str(identity)], check=True, capture_output=True)
    recipient = process(["age-keygen", "-y", str(identity)]).decode().strip()
    settings = connection.settings_dict
    administrator_url = make_conninfo(
        host=settings["HOST"],
        port=settings["PORT"],
        dbname=settings["NAME"],
        user=settings["USER"],
        password=settings["PASSWORD"],
    )
    # Exercise the actual provisioning template and a restricted backup login;
    # a superuser dump would hide missing sequence permissions in production.
    assert settings["HOST"] in {"127.0.0.1", "localhost"}
    root = Path(__file__).resolve().parents[2]
    psql = str(Path(os.environ.get("PG_DUMP", "pg_dump")).with_name("psql"))
    process(
        [
            psql,
            "--no-password",
            "--set",
            "ON_ERROR_STOP=1",
            "--file",
            str(root / "scripts/ops/database-roles.sql"),
        ],
        env=pg_environment(administrator_url),
    )
    password = secrets.token_urlsafe(24)
    with connect(administrator_url) as administrator:
        administrator.execute(
            sql.SQL("ALTER ROLE choralation_backup PASSWORD {}").format(sql.Literal(password))
        )
        # Created after provisioning: verifies the migration owner's default grants.
        administrator.execute("CREATE SEQUENCE public.operations_future_sequence")
        assert administrator.execute(
            "SELECT has_sequence_privilege('choralation_backup', "
            "'public.operations_future_sequence', 'SELECT'), "
            "has_sequence_privilege('choralation_backup', "
            "'public.operations_future_sequence', 'USAGE'), "
            "has_sequence_privilege('choralation_backup', "
            "'public.operations_future_sequence', 'UPDATE')"
        ).fetchone() == (True, False, False)
    url = make_conninfo(
        host=settings["HOST"],
        port=settings["PORT"],
        dbname=settings["NAME"],
        user="choralation_backup",
        password=password,
    )
    with connect(url) as reader:
        assert reader.execute(
            "SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user"
        ).fetchone() == (False, False)
    repository = Repository(destination, recipient=recipient, identity=identity)
    sha = process(["git", "-C", str(root), "rev-parse", "HEAD"]).decode().strip()
    completed = create_snapshot(url, source, repository, kind="daily", commit=sha)
    assert completed["objects"] == 2
    # Every payload/manifest has an age envelope; restore verifies its plaintext.
    assert all(
        row["data"].startswith(b"age-encryption.org/v1\n")
        for (project, bucket, key), row in storage_http_api.rows.items()
        if project == "backup1" and key.endswith(".age")
    )
    # A PR merge commit is not yet on main; this job has no production secrets.
    result = rehearse(repository, completed["id"], trusted_ref=sha)
    assert result["status"] == "passed" and result["objects"] == 2
