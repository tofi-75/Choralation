"""Free-tier startup: migrate first, then replace this process with Gunicorn."""

import os
import subprocess
import sys
from pathlib import Path

from config.environment import boolean

BACKEND = Path(__file__).resolve().parent.parent


def prepare_database(run=subprocess.run):
    """Safe to replay; no accounts, passwords or fictional records are auto-created."""
    for command in ("migrate", "provision_roles", "seed_initial_data"):
        run(
            [sys.executable, str(BACKEND / "manage.py"), command, "--noinput"]
            if command == "migrate"
            else [sys.executable, str(BACKEND / "manage.py"), command],
            check=True,
            cwd=BACKEND,
        )


def start():
    """Paid pre-deploy upgrades set RUN_STARTUP_MIGRATIONS=false."""
    if boolean("RUN_STARTUP_MIGRATIONS", True):
        prepare_database()
    port = int(os.environ.get("PORT", "10000"))
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be a valid TCP port.")
    os.chdir(BACKEND)
    os.execvp(
        "gunicorn",
        [
            "gunicorn",
            "config.wsgi:application",
            "--bind",
            f"0.0.0.0:{port}",
            "--workers",
            "1",
            "--threads",
            "2",
            "--access-logfile",
            "-",
            "--error-logfile",
            "-",
        ],
    )


if __name__ == "__main__":
    start()
