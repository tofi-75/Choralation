"""Export hosted Django tables with a hidden, memory-only database password.

Run in an interactive terminal. No .env file or Google/Render credentials are read.
The archive contains private application data and stays in ignored .local/backups.
Supabase Storage objects are separate and are not included in this database dump.
"""

import getpass
import os
import re
import secrets
import subprocess
import warnings
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    host = input("Supabase Session pooler hostname (no URL or password): ").strip()
    username = input("Database username (postgres.YOUR_PROJECT_REF): ").strip()
    if not re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.pooler\.supabase\.com", host):
        raise ValueError("Use the exact Supabase Session pooler hostname.")
    if not re.fullmatch(r"postgres\.[a-z0-9]+", username):
        raise ValueError("Use the Session pooler database username, not your account email.")
    binary = ROOT / ".local" / "postgres" / "bin"
    dump = binary / ("pg_dump.exe" if os.name == "nt" else "pg_dump")
    restore = binary / ("pg_restore.exe" if os.name == "nt" else "pg_restore")
    if not dump.is_file() or not restore.is_file():
        raise ValueError("Project PostgreSQL tools are missing. Run the local setup first.")
    folder = ROOT / ".local" / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    archive = folder / f"hosted-app-{stamp}-{secrets.token_hex(3)}.dump"
    print(f"Read-only export: {host}:5432 / postgres / public schema")
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", getpass.GetPassWarning)
            password = getpass.getpass("Database password (hidden; not saved): ")
    except getpass.GetPassWarning:
        raise ValueError("Use an interactive terminal with hidden password input.") from None
    if not password:
        raise ValueError("A database password is required.")
    environment = os.environ.copy()
    for key in ("PGSERVICE", "PGSERVICEFILE", "PGOPTIONS"):
        environment.pop(key, None)
    environment.update(
        PGHOST=host,
        PGPORT="5432",
        PGUSER=username,
        PGDATABASE="postgres",
        PGSSLMODE="require",
        PGCONNECT_TIMEOUT="10",
        PGPASSWORD=password,
    )
    try:
        result = subprocess.run(
            [
                str(dump),
                "--no-password",
                "--format=custom",
                "--schema=public",
                "--no-owner",
                "--no-acl",
                "--file",
                str(archive),
            ],
            env=environment,
            capture_output=True,
            timeout=600,
        )
        if result.returncode:
            raise ValueError(
                "Backup failed. Check the host, database password and network. "
                "Provider details were suppressed; do not share credentials."
            )
        result = subprocess.run(
            [str(restore), "--list", str(archive)],
            capture_output=True,
            timeout=30,
        )
        if result.returncode or not archive.stat().st_size:
            raise ValueError("The backup archive could not be validated.")
    except BaseException:
        archive.unlink(missing_ok=True)
        raise
    finally:
        environment.pop("PGPASSWORD", None)
        password = None
    print(f"Backup saved and archive listing checked: {archive}")
    print("No database changes were made. Restore rehearsal is still required.")
    print("This archive contains private data. Uploaded PDFs require a separate backup.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, subprocess.TimeoutExpired) as error:
        print(
            str(error) if isinstance(error, ValueError) else "Backup failed safely; no deployment."
        )
        raise SystemExit(1) from None
