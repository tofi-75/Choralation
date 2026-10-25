"""Explicit hosted administration, using an ignored project-local environment file.

No shell interpolation, passwords in arguments, automatic reset or local DB fallback.
The parent terminal environment and local .env are never modified.
"""

import argparse
import os
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from django.core.exceptions import ImproperlyConfigured  # noqa: E402

from config.environment import read_environment  # noqa: E402


def hosted_environment(file: Path) -> tuple[dict, str]:
    """Reject missing/unsafe targets before importing Django or opening a connection."""
    resolved = file.resolve()
    if resolved.parent != ROOT or not resolved.name.startswith(".env.hosted"):
        raise ValueError("Use a project-local .env.hosted file.")
    if not resolved.is_file():
        raise ValueError("Copy .env.hosted.example to .env.hosted and fill in private settings.")
    values = read_environment(resolved)
    parsed = urlsplit(values.get("DATABASE_URL", ""))
    host = parsed.hostname or ""
    if (
        parsed.scheme not in {"postgres", "postgresql"}
        or not host.endswith(".pooler.supabase.com")
        or parsed.port != 5432
    ):
        raise ValueError("Use the Supabase session pooler on port 5432.")
    if not values.get("DJANGO_SECRET_KEY") or len(values["DJANGO_SECRET_KEY"]) < 50:
        raise ValueError("Supply a hosted Django secret of at least 50 characters.")
    # Require a minimal explicit configuration, so local .env cannot fill missing values.
    required = (
        "DJANGO_STORAGE_BACKEND",
        "AWS_STORAGE_BUCKET_NAME",
        "AWS_S3_ENDPOINT_URL",
        "AWS_S3_REGION_NAME",
        "AWS_ACCESS_KEY_ID",
        "AWS_SECRET_ACCESS_KEY",
    )
    if values.get("DJANGO_STORAGE_BACKEND") != "s3" or any(not values.get(key) for key in required):
        raise ValueError("Supply private hosted S3 settings.")
    from config.hosting import database_options

    database_options(values["DATABASE_URL"], False)
    environment = os.environ.copy()
    environment.update(values)
    environment.update(
        {
            "DJANGO_DEBUG": "false",
            "DJANGO_SERVE_FRONTEND": "false",
            "DJANGO_TRUST_PROXY_HTTPS": "false",
        }
    )
    return environment, host


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "action",
        choices=(
            "create-admin",
            "create-user",
            "seed-demo",
            "check",
            "audit-accounts",
            "recover-account",
            "cleanup-accounts",
            "change-password",
        ),
    )
    parser.add_argument("--email")
    parser.add_argument("--confirm-email-ownership", action="store_true")
    parser.add_argument("--username")
    parser.add_argument("--role", choices=("Admin", "Planner", "Viewer"), default="Viewer")
    parser.add_argument("--env-file", default=str(ROOT / ".env.hosted"))
    options = parser.parse_args()
    try:
        environment, host = hosted_environment(Path(options.env_file))
        if (
            options.action in {"create-user", "seed-demo", "recover-account", "change-password"}
            and not options.username
        ):
            raise ValueError("This action requires --username.")
        if options.action == "recover-account" and (
            not options.email or not options.confirm_email_ownership
        ):
            raise ValueError(
                "Recovery requires --email and --confirm-email-ownership after independently verifying ownership."
            )
        if (
            options.action == "seed-demo"
            and environment.get("ALLOW_HOSTED_DEMO_DATA", "false").lower() != "true"
        ):
            raise ValueError("Enable ALLOW_HOSTED_DEMO_DATA explicitly for hosted testing.")
    except (ValueError, OSError, ImproperlyConfigured) as error:
        parser.error(str(error))
    print(f"Target: hosted Supabase database at {host}. Local data is untouched.")
    if input("Type HOSTED to continue: ") != "HOSTED":
        parser.exit(1, "Cancelled. No command was run.\n")
    commands = {
        "create-admin": ["createsuperuser"],
        "create-user": ["create_app_user", options.username or "", "--role", options.role],
        "seed-demo": ["seed_demo_data", "--username", options.username or "", "--allow-hosted"],
        "check": ["check"],
        "audit-accounts": ["audit_accounts"],
        "recover-account": [
            "recover_account",
            options.username or "",
            "--email",
            options.email or "",
            "--confirm-email-ownership",
        ],
        "cleanup-accounts": ["cleanup_account_security"],
        "change-password": ["changepassword", options.username or ""],
    }
    # Admin/password prompts are inherited; neither passwords nor URLs are printed.
    result = subprocess.run(
        [sys.executable, str(ROOT / "backend/manage.py"), *commands[options.action]],
        env=environment,
        cwd=ROOT,
    )
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
