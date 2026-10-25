"""Interactive owner-only acceptance: two emails, disposable DB, no token reports.

Run once with --send-two after automated checks pass. Do not automatically retry.
The owner uses the two actual email links and confirms a new-password sign-in.
"""

import argparse
import json
import os
import secrets
import socket
import subprocess
import sys
import time
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from config.environment import load_environment  # noqa: E402

RECIPIENT = "tofi.lattouf@gmail.com"
PORT = 8012
STATUS = ROOT / ".local/gmail-live-status.json"
LOGIN = ROOT / ".local/gmail-live-login.txt"
LEDGER = ROOT / ".local/gmail-live-send-ledger.json"


def status(state, **extra):
    STATUS.write_text(
        json.dumps({"state": state, "url": f"http://127.0.0.1:{PORT}", **extra}, indent=2),
        encoding="utf-8",
    )
    print(state, flush=True)


def wait_until(predicate, state):
    status(state)
    deadline = time.monotonic() + 1200
    while time.monotonic() < deadline:
        if predicate():
            return
        time.sleep(2)
    raise TimeoutError


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--send-two", action="store_true")
    options = parser.parse_args()
    if not options.send_two:
        parser.exit(0, "No emails sent. Explicit --send-two is required for the authorized test.\n")
    load_environment(ROOT / ".env")
    original = os.environ["DATABASE_URL"]
    parsed = urlsplit(original)
    if parsed.hostname not in {"localhost", "127.0.0.1"}:
        parser.error("Live acceptance is restricted to a disposable local database.")
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", PORT)) == 0:
            parser.error("The local acceptance port is occupied; no service was changed.")
    credentials = json.loads(
        (ROOT / ".local/gmail-hosted-settings.json").read_text(encoding="utf-8-sig")
    )
    keys = ("GMAIL_CLIENT_ID", "GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN")
    if not all(isinstance(credentials.get(key), str) and credentials[key].strip() for key in keys):
        parser.error("Complete the owner Gmail authorization first.")
    run = secrets.token_hex(6)
    database = "gmail_live_" + run
    # An exclusive ledger prevents accidental reruns/additional unapproved sends.
    try:
        ledger = {"run": run, "attempts": []}
        with LEDGER.open("x", encoding="utf-8") as handle:
            json.dump(ledger, handle)
    except FileExistsError:
        parser.error(
            "A live-send ledger already exists. Do not retry without new owner authorization."
        )
    cache = ROOT / ".cache/gmail-live" / run
    cache.mkdir(parents=True)
    os.environ.update({key: credentials[key] for key in keys})
    os.environ.update(
        {
            "DATABASE_URL": urlunsplit(parsed._replace(path="/" + database)),
            "DJANGO_SETTINGS_MODULE": "config.settings",
            "DJANGO_DEBUG": "true",
            "DJANGO_SERVE_FRONTEND": "true",
            "DJANGO_STORAGE_BACKEND": "local",
            "DJANGO_MEDIA_ROOT": str(cache / "media"),
            "MARONITE_FEED_ENABLED": "false",
            "DJANGO_ALLOWED_HOSTS": "127.0.0.1,localhost,testserver",
            "APP_PUBLIC_URL": f"http://127.0.0.1:{PORT}",
            "CSRF_TRUSTED_ORIGINS": f"http://127.0.0.1:{PORT}",
            "EMAIL_BACKEND": "accounts.email_backend.GmailBackend",
            "DEFAULT_FROM_EMAIL": f"Choralation <{RECIPIENT}>",
            "ACCOUNT_REGISTRATION_ENABLED": "false",
            "ACCOUNT_VERIFICATION_REQUIRED": "true",
            "ACCOUNT_EMAIL_DAILY_LIMIT": "2",
            "ALLOW_HOSTED_DEMO_DATA": "false",
        }
    )
    server = None
    logs = []
    created = False
    with psycopg.connect(original, autocommit=True) as admin:
        try:
            admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
            created = True
            subprocess.run(
                [sys.executable, "-B", str(ROOT / "backend/manage.py"), "migrate", "--noinput"],
                cwd=ROOT,
                check=True,
                stdout=subprocess.DEVNULL,
            )
            import django

            django.setup()
            from django.contrib.auth import get_user_model
            from django.core.mail import send_mail
            from django.db import connections
            from django.test import Client

            from accounts.models import AccountProfile, AccountToken
            from accounts.services import issue_link

            username = "gmail-check-" + run
            password = secrets.token_urlsafe(32) + "!Check"
            user = get_user_model().objects.create_user(
                username=username, email=RECIPIENT, password=password
            )
            profile = AccountProfile.objects.create(
                user=user, email=RECIPIENT, username_key=username, requires_verification=True
            )
            LOGIN.write_text(
                f"Local disposable Gmail test only\nURL: http://127.0.0.1:{PORT}/login\nUsername: {username}\nPassword: {password}\n",
                encoding="utf-8",
            )
            os.chmod(LOGIN, 0o600)
            old_session = Client(enforce_csrf_checks=True)
            if not old_session.login(username=username, password=password):
                raise RuntimeError("test-login")
            old_hash = user.password
            # The HTTP server cannot request extra emails. Only this process sends.
            (cache / "live_guard.py").write_text(
                "from django.http import JsonResponse\n"
                "class Guard:\n"
                " def __init__(self, get_response): self.get_response=get_response\n"
                " def __call__(self, request):\n"
                "  allowed=('/api/v1/auth/login/','/api/v1/auth/logout/','/api/v1/auth/verify-email/','/api/v1/auth/password-reset/confirm/')\n"
                "  if request.method not in ('GET','HEAD','OPTIONS') and request.path not in allowed: return JsonResponse({'detail':'This acceptance server cannot send additional emails.'},status=403)\n"
                "  return self.get_response(request)\n",
                encoding="utf-8",
            )
            (cache / "live_settings.py").write_text(
                "from config.settings import *\nMIDDLEWARE = [*MIDDLEWARE, 'live_guard.Guard']\n",
                encoding="utf-8",
            )
            environment = os.environ.copy()
            environment["DJANGO_SETTINGS_MODULE"] = "live_settings"
            environment["PYTHONPATH"] = str(cache) + os.pathsep + str(ROOT / "backend")
            for name in ("server.out.log", "server.err.log"):
                logs.append((cache / name).open("w", encoding="utf-8"))
            server = subprocess.Popen(
                [
                    sys.executable,
                    "-B",
                    str(ROOT / "backend/manage.py"),
                    "runserver",
                    f"127.0.0.1:{PORT}",
                    "--noreload",
                ],
                cwd=ROOT,
                env=environment,
                stdout=logs[0],
                stderr=logs[1],
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            )

            def restricted_send(subject, body, sender, recipients, **kwargs):
                expected = (
                    "Verify your Choralation email"
                    if not ledger["attempts"]
                    else "Reset your Choralation password"
                )
                if len(ledger["attempts"]) >= 2 or recipients != [RECIPIENT] or subject != expected:
                    raise RuntimeError("send-budget")
                ledger["attempts"].append(
                    {"purpose": "verify" if not ledger["attempts"] else "reset", "accepted": False}
                )
                LEDGER.write_text(json.dumps(ledger, indent=2), encoding="utf-8")
                sent = send_mail(subject, body, sender, recipients, **kwargs)
                ledger["attempts"][-1]["accepted"] = sent == 1
                LEDGER.write_text(json.dumps(ledger, indent=2), encoding="utf-8")
                return sent

            with patch("accounts.services.send_mail", side_effect=restricted_send):
                issue_link(user, "verify")
                wait_until(
                    lambda: AccountProfile.objects.filter(
                        pk=profile.pk, verified_at__isnull=False
                    ).exists(),
                    "awaiting-owner-verification",
                )
                reset_login_marker = get_user_model().objects.get(pk=user.pk).last_login
                csrf = old_session.get("/api/v1/auth/csrf/").json()["csrf_token"]
                response = old_session.post(
                    "/api/v1/auth/password-reset/request/",
                    {"email": RECIPIENT},
                    content_type="application/json",
                    HTTP_X_CSRFTOKEN=csrf,
                )
                if (
                    response.status_code != 200
                    or len(ledger["attempts"]) != 2
                    or not ledger["attempts"][-1]["accepted"]
                ):
                    raise RuntimeError("reset-delivery")
                wait_until(
                    lambda: (
                        not get_user_model().objects.filter(pk=user.pk, password=old_hash).exists()
                    ),
                    "awaiting-owner-password-reset",
                )
                if old_session.get("/api/v1/auth/me/").status_code != 403:
                    raise RuntimeError("session-not-invalidated")
                user.refresh_from_db()
                if (
                    user.check_password(password)
                    or AccountToken.objects.filter(user=user, consumed_at=None).exists()
                ):
                    raise RuntimeError("reset-invariant")
                last_login = reset_login_marker
                wait_until(
                    lambda: get_user_model().objects.get(pk=user.pk).last_login != last_login,
                    "awaiting-owner-new-password-login",
                )
            status("passed", initial_emails=2, owner_links_used=True, old_session_invalidated=True)
            connections.close_all()
        except Exception as error:
            # Do not print exceptions, credentials, URLs, message content or tokens.
            status(
                "incomplete",
                failure_type=type(error).__name__,
                send_attempts=len(ledger["attempts"]),
            )
            raise SystemExit(1) from None
        finally:
            if server:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait(timeout=5)
            for log in logs:
                log.close()
            LOGIN.unlink(missing_ok=True)
            if created:
                admin.execute(
                    sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database))
                )
            print(
                "Disposable acceptance database removed; normal local and hosted settings were not changed.",
                flush=True,
            )


if __name__ == "__main__":
    main()
