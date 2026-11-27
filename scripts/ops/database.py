"""Persistent ownership plus PostgreSQL session locks; no TTL-based unlocking."""

import json
import os
import time
from contextlib import contextmanager

import psycopg
from psycopg import sql
from psycopg.conninfo import conninfo_to_dict

from .core import OpsError, now, process

MUTATION_LOCK = 7281349201
OPERATIONS_LOCK = 7281349202


def connect(url):
    values = conninfo_to_dict(url)
    if values.get("port") == "6543":
        raise OpsError("Use the Session pooler or direct database, not transaction port 6543.")
    if values.get("host") not in {"127.0.0.1", "localhost"} and values.get("sslmode") not in {
        "require",
        "verify-full",
        "verify-ca",
    }:
        raise OpsError("Hosted operations database connections require TLS.")
    return psycopg.connect(url, autocommit=True, connect_timeout=10)


def pg_environment(url):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    values = conninfo_to_dict(url)
    for key, variable in {
        "host": "PGHOST",
        "port": "PGPORT",
        "user": "PGUSER",
        "password": "PGPASSWORD",
        "dbname": "PGDATABASE",
        "sslmode": "PGSSLMODE",
        "sslrootcert": "PGSSLROOTCERT",
    }.items():
        if key in values:
            env[variable] = values[key]
    env["PGCONNECT_TIMEOUT"] = "10"
    return env


class Control:
    def __init__(self, url):
        self.connection = connect(url)
        self.owner = None

    def state(self):
        with self.connection.cursor(row_factory=psycopg.rows.dict_row) as cursor:
            cursor.execute("SELECT * FROM public.common_operationsstate WHERE id=1")
            row = cursor.fetchone()
        if not row:
            raise OpsError("Operations migration is not installed.")
        return row

    @contextmanager
    def lock(self):
        acquired = self.connection.execute(
            "SELECT pg_try_advisory_lock(%s)", [OPERATIONS_LOCK]
        ).fetchone()[0]
        if not acquired:
            raise OpsError("Another production operation is active.")
        try:
            yield self
        finally:
            self.connection.execute("SELECT pg_advisory_unlock(%s)", [OPERATIONS_LOCK])

    def begin(self, owner, reason, target=""):
        state = self.state()
        if state["read_only"] or state["operation_id"]:
            raise OpsError(
                "Unresolved production operation; inspect and recover it before continuing."
            )
        self.owner = owner
        self.connection.execute(
            "UPDATE public.common_operationsstate SET read_only=true, operation_id=%s, phase='draining', reason=%s, target_sha=%s, deployment_id='', snapshot_id='', started_at=NOW(), updated_at=NOW() WHERE id=1",
            [owner, reason, target],
        )
        deadline = time.monotonic() + 60
        while not self.connection.execute(
            "SELECT pg_try_advisory_lock(%s)", [MUTATION_LOCK]
        ).fetchone()[0]:
            if time.monotonic() >= deadline:
                raise OpsError("Timed out draining content changes; no deployment was requested.")
            time.sleep(0.25)
        self.connection.execute("SELECT pg_advisory_unlock(%s)", [MUTATION_LOCK])
        self.update(phase="snapshotting")

    def update(self, **fields):
        allowed = {
            "phase",
            "snapshot_id",
            "deployment_id",
            "last_backup",
            "last_release",
            "last_restore",
        }
        if not fields or not fields.keys() <= allowed:
            raise OpsError("Invalid operations state update.")
        values = [
            json.dumps(value) if key.startswith("last_") else value for key, value in fields.items()
        ]
        assignments = sql.SQL(", ").join(
            sql.SQL("{} = %s").format(sql.Identifier(key)) for key in fields
        )
        query = sql.SQL(
            "UPDATE public.common_operationsstate SET {}, updated_at=NOW() WHERE id=1 AND operation_id=%s"
        ).format(assignments)
        if self.connection.execute(query, [*values, self.owner]).rowcount != 1:
            raise OpsError("Operations ownership changed; refusing state update.")

    def finish(self, *, phase="idle"):
        if (
            self.connection.execute(
                "UPDATE public.common_operationsstate SET read_only=false, operation_id='', reason='', phase=%s, updated_at=NOW() WHERE id=1 AND operation_id=%s",
                [phase, self.owner],
            ).rowcount
            != 1
        ):
            raise OpsError("Operations ownership changed; refusing to reopen editing.")

    def close(self):
        self.connection.close()


def export_database(url, destination):
    """Dump and inventories share one MVCC snapshot, including attended bootstrap."""
    from pathlib import Path

    with connect(url) as connection:
        connection.execute("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
        version = int(connection.execute("SHOW server_version_num").fetchone()[0]) // 10000
        snapshot = connection.execute("SELECT pg_export_snapshot()").fetchone()[0]
        captured_at = now()
        tables = [
            row[0]
            for row in connection.execute(
                "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename"
            )
        ]
        counts = {
            name: connection.execute(
                sql.SQL("SELECT count(*) FROM public.{}").format(sql.Identifier(name))
            ).fetchone()[0]
            for name in tables
        }
        pdfs = [
            row[0]
            for row in connection.execute(
                "SELECT DISTINCT sheet_music_pdf FROM public.hymns_hymn WHERE sheet_music_pdf <> '' AND sheet_music_pdf IS NOT NULL"
            )
        ]
        binary = os.environ.get("PG_DUMP", "pg_dump")
        import re

        tool_version = process([binary, "--version"]).decode()
        found = re.search(r"(\d+)\.", tool_version)
        if not found or int(found[1]) < version:
            raise OpsError("pg_dump must be at least the source PostgreSQL major version.")
        env = pg_environment(url)
        try:
            process(
                [
                    binary,
                    "--no-password",
                    "--format=custom",
                    "--schema=public",
                    "--no-owner",
                    "--no-acl",
                    f"--snapshot={snapshot}",
                    "--file",
                    str(destination),
                ],
                env=env,
            )
        finally:
            env.pop("PGPASSWORD", None)
        process(
            [os.environ.get("PG_RESTORE", "pg_restore"), "--list", str(destination)], timeout=60
        )
        if not Path(destination).stat().st_size:
            raise OpsError("Database export is empty.")
        return {
            "postgres_major": version,
            "table_counts": counts,
            "referenced_pdfs": sorted(pdfs),
            "captured_at": captured_at,
        }
