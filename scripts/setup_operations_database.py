"""Owner-run login checks and private URL files for the three operations roles.

Passwords are entered at hidden prompts, never as arguments or printed URLs.
This performs read-only checks; it does not create roles, migrate, back up or deploy.
"""

import argparse
import csv
import getpass
import io
import os
import re
import subprocess
import sys
import warnings
from pathlib import Path
from urllib.parse import quote

import psycopg

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / ".local/operations/database-urls"
ROLES = (
    ("choralation_backup", "BACKUP_DATABASE_URL.txt"),
    ("choralation_operations", "GITHUB_OPERATIONS_DATABASE_URL.txt"),
    ("choralation_gate", "RENDER_OPERATIONS_DATABASE_URL.txt"),
)


class SetupError(Exception):
    """Only static, non-secret messages may reach the terminal."""


def validate_target(host, project_ref, database):
    if not re.fullmatch(r"[a-z0-9.-]+\.pooler\.supabase\.com", host):
        raise SetupError("Use the exact Supabase Session-pooler hostname from Connect.")
    if not re.fullmatch(r"[a-z0-9]{20}", project_ref):
        raise SetupError("Use the production project's 20-character reference.")
    if not re.fullmatch(r"[A-Za-z0-9_]+", database):
        raise SetupError("Use the intended PostgreSQL database name.")


def connection_url(host, project_ref, database, role, password):
    validate_target(host, project_ref, database)
    if role not in {name for name, _ in ROLES} or not password:
        raise SetupError("A configured operations role and nonempty password are required.")
    return (
        f"postgresql://{quote(role + '.' + project_ref, safe='')}:"
        f"{quote(password, safe='')}@{host}:5432/{quote(database, safe='')}?sslmode=require"
    )


def verify_login(url, role, database):
    try:
        with psycopg.connect(url, autocommit=True, connect_timeout=15) as connection:
            row = connection.execute(
                "SELECT current_database(), current_user, rolsuper, rolcreatedb, "
                "rolcreaterole, rolbypassrls, rolreplication, rolcanlogin, "
                "has_table_privilege(current_user, 'public.hymns_hymn', 'SELECT'), "
                "has_table_privilege(current_user, 'public.hymns_hymn', 'INSERT'), "
                "has_table_privilege(current_user, 'public.hymns_hymn', 'UPDATE'), "
                "has_table_privilege(current_user, 'public.hymns_hymn', 'DELETE') "
                "FROM pg_roles WHERE rolname = current_user"
            ).fetchone()
            if (
                not row
                or row[:2] != (database, role)
                or any(row[2:7])
                or not row[7]
                or row[8] != (role == "choralation_backup")
                or any(row[9:12])
            ):
                raise SetupError("Role identity or permissions differ from the restricted setup.")
            if role == "choralation_backup":
                # Exercise the real grant without fetching private application rows.
                connection.execute("SELECT id FROM public.hymns_hymn LIMIT 0")
    except psycopg.Error:
        raise SetupError(
            "Database login/check failed. Check the role password, target and grants; "
            "private provider details are suppressed."
        ) from None


def checked_output():
    destination = OUTPUT.resolve()
    if not destination.is_relative_to(ROOT.resolve()) or destination.exists():
        raise SetupError(
            "The output must be new and inside this checkout; existing files are preserved."
        )
    result = subprocess.run(
        ["git", "check-ignore", "--quiet", str(destination / "private.txt")],
        cwd=ROOT,
        capture_output=True,
    )
    if result.returncode:
        raise SetupError("Private URL files must be Git-ignored before entering credentials.")
    return destination


def protect_directory(directory):
    """Limit the newly created secret directory to its current owner."""
    if os.name != "nt":
        directory.chmod(0o700)
        return
    system = Path(os.environ["SystemRoot"]) / "System32"
    result = subprocess.run(
        [str(system / "whoami.exe"), "/user", "/fo", "csv", "/nh"],
        capture_output=True,
    )
    try:
        sid = next(csv.reader(io.StringIO(result.stdout.decode())))[1]
    except (IndexError, StopIteration, UnicodeError):
        raise SetupError(
            "Could not determine the owner for private URL file permissions."
        ) from None
    if result.returncode or not re.fullmatch(r"S-1-[0-9-]+", sid):
        raise SetupError("Could not determine the owner for private URL file permissions.")
    result = subprocess.run(
        [
            str(system / "icacls.exe"),
            str(directory),
            "/inheritance:r",
            "/grant:r",
            f"*{sid}:(OI)(CI)F",
        ],
        capture_output=True,
    )
    if result.returncode:
        raise SetupError("Could not restrict the secret directory; no URLs were written.")


def prepare(host, project_ref, database):
    validate_target(host, project_ref, database)
    destination = checked_output()
    if not sys.stdin.isatty():
        raise SetupError("Run this helper directly in an interactive terminal with hidden input.")
    print(f"Target: {host}:5432 / {database} / project {project_ref}")
    print(
        "Read-only login checks. Enter each role's existing password; no passwords or URLs are printed."
    )
    urls = {}
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        for role, filename in ROLES:
            password = getpass.getpass(f"{role} password: ")
            url = connection_url(host, project_ref, database, role, password)
            verify_login(url, role, database)
            urls[filename] = url
            print(f"Verified {role}.")
    # Nothing is persisted until every login passes. Never overwrite an existing
    # directory or URL file, including when setup is accidentally run twice.
    destination.mkdir(parents=True, mode=0o700)
    protect_directory(destination)
    for filename, url in urls.items():
        descriptor = os.open(destination / filename, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(url + "\n")
    print("All three logins passed. Private connection URLs saved in:")
    print(destination)
    print(
        "Copy the files directly into the intended GitHub/Render settings; never paste them in chat."
    )
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", required=True)
    parser.add_argument("--project-ref", required=True)
    parser.add_argument("--database", default="postgres")
    args = parser.parse_args()
    try:
        prepare(args.host, args.project_ref, args.database)
    except (SetupError, getpass.GetPassWarning) as error:
        parser.exit(1, str(error) + "\n")
    except (OSError, ValueError, EOFError, KeyboardInterrupt):
        parser.exit(
            1, "Setup stopped; private details suppressed. Check existing output before retrying.\n"
        )


if __name__ == "__main__":
    main()
