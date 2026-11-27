"""Destructive restoration is confined to fresh, run-owned Docker resources.

There is deliberately no production-target option. A production recovery requires
the attended runbook and separate authorization, never an automatic rollback.
"""

import json
import os
import re
import secrets
import sys
import tarfile
import time
from pathlib import Path

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError
from psycopg import sql

from .core import OpsError, file_digest, now, private_directory, process
from .database import connect, pg_environment

ROOT = Path(__file__).resolve().parents[2]
POSTGRES_IMAGES = {17: "postgres:17.11", 18: "postgres:18.6"}
MOTO_IMAGE = (
    "motoserver/moto:5.1.11@sha256:8ca337023ebaa5c0b8b33503b178d4db3326fca184551d6f47b07b8dd8532644"
)


def export_snapshot(repository, snapshot, output=None):
    """Inventory by default; explicit export writes only to a new private local folder."""
    selected = next((item for item in repository.snapshots() if item["id"] == snapshot), None)
    if not selected:
        raise OpsError("Requested completed backup does not exist.")
    manifest = repository.manifest(selected)
    summary = {
        "id": manifest["id"],
        "commit": manifest["commit"],
        "created_at": manifest["created_at"],
        "objects": len(manifest["objects"]),
        "postgres_major": manifest["inventory"]["postgres_major"],
    }
    if output is None:
        return summary
    base = (ROOT / ".local" / "backups").resolve()
    folder = Path(output).resolve()
    if not folder.is_relative_to(base) or folder == base or folder.exists():
        raise OpsError(
            "Export needs a new private directory beneath this project's .local/backups."
        )
    folder.mkdir(parents=True, mode=0o700)
    repository.restore_payload(manifest["database"], folder / "application.dump")
    objects = folder / "objects"
    objects.mkdir(mode=0o700)
    for index, item in enumerate(manifest["objects"]):
        # Never turn a source Storage key into a filesystem path.
        filename = f"{index:08d}.bin"
        repository.restore_payload(item["payload"], objects / filename)
        item["export_file"] = "objects/" + filename
    for name, value in (("manifest.json", manifest), ("RESTORE_COMPLETE.json", summary)):
        target = folder / name
        target.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
        target.chmod(0o600)
    summary["exported"] = True
    return summary


def docker_port(name, container_port):
    output = process(["docker", "port", name, str(container_port)]).decode().strip()
    if not re.fullmatch(r"127\.0\.0\.1:\d+", output):
        raise OpsError("Restore resources must be bound only to localhost.")
    return int(output.rsplit(":", 1)[1])


def checked_rehearsal(control, repository, snapshot=None, *, attended=False):
    with control.lock():
        installed = control.connection.execute(
            "SELECT to_regclass('public.common_operationsstate')"
        ).fetchone()[0]
        if not installed and not attended:
            raise OpsError("Install the operations migration before automatic restoration tests.")
        if installed:
            state = control.state()
            if state["read_only"] or state["operation_id"]:
                raise OpsError("Resolve the active release before a restore rehearsal.")
            control.owner = ""
            control.update(last_restore={"status": "running", "created_at": now()})
        try:
            result = rehearse(repository, snapshot)
        except BaseException:
            if installed:
                control.update(last_restore={"status": "failed", "created_at": now()})
            raise
        if installed:
            control.update(last_restore=result)
        return result


def rehearse(repository, snapshot=None, *, trusted_ref="origin/main"):
    if sys.platform != "linux":
        raise OpsError(
            "Restore rehearsal runs on isolated Linux CI; no production target is supported."
        )
    snapshots = repository.snapshots()
    selected = next(
        (item for item in snapshots if snapshot is None or item["id"] == snapshot), None
    )
    if not selected:
        raise OpsError("Requested completed backup does not exist.")
    manifest = repository.manifest(selected)
    major = manifest["inventory"]["postgres_major"]
    if major not in POSTGRES_IMAGES:
        raise OpsError(
            "Pin and test the source PostgreSQL image before rehearsing this major version."
        )
    commit = manifest["commit"]
    if not re.fullmatch(r"[a-f0-9]{40}", commit):
        raise OpsError("A real source commit is required to rehearse the matching application.")
    # The backup does not choose arbitrary executable code: require trusted main ancestry.
    process(["git", "merge-base", "--is-ancestor", commit, trusted_ref], timeout=60)
    suffix = secrets.token_hex(8)
    database_name, s3_name = f"choralation-restore-{suffix}-db", f"choralation-restore-{suffix}-s3"
    password = secrets.token_hex(24)
    start = time.monotonic()
    try:
        with private_directory("restore-") as directory:
            folder = Path(directory)
            archive = folder / "application.dump"
            repository.restore_payload(manifest["database"], archive)
            process(
                [
                    "docker",
                    "run",
                    "-d",
                    "--name",
                    database_name,
                    "--label",
                    "choralation.restore=true",
                    "--tmpfs",
                    "/var/lib/postgresql",
                    "-p",
                    "127.0.0.1::5432",
                    "-e",
                    f"POSTGRES_PASSWORD={password}",
                    "-e",
                    "POSTGRES_USER=restore",
                    "-e",
                    "POSTGRES_DB=restore",
                    "-e",
                    "PGDATA=/var/lib/postgresql/data",
                    POSTGRES_IMAGES[major],
                ],
                timeout=300,
            )
            port = docker_port(database_name, 5432)
            url = f"postgresql://restore:{password}@127.0.0.1:{port}/restore"
            for _ in range(60):
                try:
                    with connect(url):
                        break
                except Exception:
                    time.sleep(1)
            else:
                raise OpsError("Temporary restore database did not start.")
            env = pg_environment(url)
            try:
                process(
                    [
                        os.environ.get("PG_RESTORE", "pg_restore"),
                        "--exit-on-error",
                        "--clean",
                        "--if-exists",
                        "--no-owner",
                        "--no-acl",
                        "--dbname",
                        "restore",
                        str(archive),
                    ],
                    env=env,
                )
            finally:
                env.pop("PGPASSWORD", None)
            with connect(url) as database:
                for table, expected in manifest["inventory"]["table_counts"].items():
                    actual = database.execute(
                        sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(table))
                    ).fetchone()[0]
                    if actual != expected:
                        raise OpsError("Restored database row counts differ from the snapshot.")
                unvalidated = database.execute(
                    "SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='public'::regnamespace AND NOT convalidated"
                ).fetchone()[0]
                if unvalidated:
                    raise OpsError("Restored database has unvalidated foreign keys.")
            certs = folder / "certs"
            certs.mkdir(mode=0o700)
            cert, key = certs / "public.crt", certs / "private.key"
            process(
                [
                    "openssl",
                    "req",
                    "-x509",
                    "-newkey",
                    "rsa:2048",
                    "-nodes",
                    "-keyout",
                    str(key),
                    "-out",
                    str(cert),
                    "-days",
                    "1",
                    "-subj",
                    "/CN=localhost",
                    "-addext",
                    "subjectAltName=DNS:localhost,IP:127.0.0.1",
                ],
                timeout=60,
            )
            key.chmod(0o600)
            process(
                [
                    "docker",
                    "run",
                    "-d",
                    "--name",
                    s3_name,
                    "--label",
                    "choralation.restore=true",
                    "-p",
                    "127.0.0.1::5000",
                    "-v",
                    f"{certs}:/restore:ro",
                    "--entrypoint",
                    "moto_server",
                    MOTO_IMAGE,
                    "-H",
                    "0.0.0.0",
                    "-p",
                    "5000",
                    "-c",
                    "/restore/public.crt",
                    "-k",
                    "/restore/private.key",
                ],
                timeout=300,
            )
            s3_port = docker_port(s3_name, 5000)
            endpoint = f"https://127.0.0.1:{s3_port}"
            storage = boto3.client(
                "s3",
                endpoint_url=endpoint,
                region_name="us-east-1",
                verify=str(cert),
                aws_access_key_id="restore-only",
                aws_secret_access_key="restore-only",
                config=Config(
                    connect_timeout=2,
                    read_timeout=10,
                    retries={"max_attempts": 0},
                    s3={"addressing_style": "path"},
                ),
            )
            for _ in range(30):
                try:
                    storage.create_bucket(Bucket="restore-pdfs")
                    break
                except (BotoCoreError, ClientError):
                    time.sleep(1)
            else:
                raise OpsError("Temporary private S3 storage did not start.")
            keys = set()
            for item in manifest["objects"]:
                path = folder / "object.bin"
                repository.restore_payload(item["payload"], path)
                options = {"ContentType": item["content_type"], "Metadata": item["metadata"]}
                if item["content_encoding"]:
                    options["ContentEncoding"] = item["content_encoding"]
                data = path.read_bytes()
                storage.put_object(Bucket="restore-pdfs", Key=item["key"], Body=data, **options)
                with storage.get_object(Bucket="restore-pdfs", Key=item["key"])["Body"] as stream:
                    path.write_bytes(stream.read())
                if file_digest(path) != item["payload"]["sha256"]:
                    raise OpsError("Restored S3 PDF differs from the snapshot.")
                keys.add(item["key"])
            if not set(manifest["inventory"]["referenced_pdfs"]) <= keys:
                raise OpsError("Restored database references an absent PDF.")
            source = folder / "application.tar"
            process(
                ["git", "archive", "--format=tar", "--output", str(source), commit, "backend"],
                timeout=60,
            )
            with tarfile.open(source) as archive_source:
                archive_source.extractall(folder / "code", filter="data")
            # Construct a fresh environment: no production DB, mail, keys or credentials reach the probe.
            probe_env = {
                name: os.environ[name]
                for name in ("PATH", "SYSTEMROOT", "HOME", "LANG")
                if name in os.environ
            }
            probe_env.update(
                {
                    "PYTHONPATH": str(folder / "code" / "backend"),
                    "DATABASE_URL": url,
                    "DJANGO_SECRET_KEY": secrets.token_hex(40),
                    "DJANGO_DEBUG": "true",
                    "DJANGO_ALLOWED_HOSTS": "testserver,localhost,127.0.0.1",
                    "DJANGO_STORAGE_BACKEND": "s3",
                    "DJANGO_REQUIRE_DURABLE_STORAGE": "true",
                    "PRODUCTION_OPERATIONS_ENABLED": "false",
                    "MARONITE_FEED_ENABLED": "false",
                    "ACCOUNT_EMAIL_VERIFICATION_ENABLED": "false",
                    "ACCOUNT_PASSWORD_RESET_ENABLED": "false",
                    "EMAIL_BACKEND": "django.core.mail.backends.dummy.EmailBackend",
                    "AWS_STORAGE_BUCKET_NAME": "restore-pdfs",
                    "AWS_S3_ENDPOINT_URL": endpoint,
                    "AWS_S3_REGION_NAME": "us-east-1",
                    "AWS_ACCESS_KEY_ID": "restore-only",
                    "AWS_SECRET_ACCESS_KEY": "restore-only",
                    "AWS_CA_BUNDLE": str(cert),
                }
            )
            # Historical code must use its own dependency lock, never whatever
            # packages happen to be installed for the current operations runner.
            environment = folder / "venv"
            process([sys.executable, "-m", "venv", str(environment)], env=probe_env, timeout=120)
            interpreter = environment / "bin" / "python"
            probe_env.update(
                PIP_NO_INPUT="1",
                PIP_DISABLE_PIP_VERSION_CHECK="1",
                PIP_CONFIG_FILE=os.devnull,
                PIP_INDEX_URL="https://pypi.org/simple",
                PIP_CACHE_DIR=str(folder / "pip-cache"),
            )
            process(
                [
                    str(interpreter),
                    "-m",
                    "pip",
                    "install",
                    "--only-binary=:all:",
                    "-r",
                    str(folder / "code" / "backend" / "requirements" / "base.txt"),
                ],
                env=probe_env,
                timeout=600,
            )
            # The archived app's .env loader must not discover the real repository's .env.
            process(
                [str(interpreter), str(ROOT / "scripts" / "restore-probe.py")],
                env=probe_env,
                timeout=180,
            )
            return {
                "status": "passed",
                "snapshot_id": manifest["id"],
                "created_at": now(),
                "objects": len(keys),
                "duration_seconds": round(time.monotonic() - start, 1),
            }
    finally:
        for name in (s3_name, database_name):
            try:
                process(["docker", "rm", "--force", "--volumes", name], timeout=60)
            except OpsError:
                pass
