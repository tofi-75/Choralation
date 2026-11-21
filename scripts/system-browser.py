"""Run the required local browser matrix in disposable PostgreSQL databases.

Profiles are serial by default. --jobs 2 (up to 4) gives each concurrent profile
its own ports, database, accounts, mail and upload directories. Existing servers
are never reused. No hosted database/storage is accepted or modified.
"""

import argparse
import os
import secrets
import shutil
import socket
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from config.environment import load_environment  # noqa: E402

load_environment(ROOT / ".env")

import psycopg  # noqa: E402
from psycopg import sql  # noqa: E402

PROFILES = ("desktop", "mobile", "mobile-360", "mobile-430")
SIMPLE_SPECS = (
    "simple-accounts.spec.ts",
    "hymn-submissions.spec.ts",
    "accounts-choirs.spec.ts",
    "manager-requests.spec.ts",
)


def command(arguments, environment, label, folder, cwd=ROOT):
    started = time.monotonic()
    log = folder / f"{label}.log"
    with log.open("w", encoding="utf-8") as output:
        result = subprocess.run(
            arguments, cwd=cwd, env=environment, stdout=output, stderr=subprocess.STDOUT
        )
    elapsed = time.monotonic() - started
    print(
        f"{label}: exit {result.returncode}, {elapsed:.1f}s ({log.relative_to(ROOT)})", flush=True
    )
    return result.returncode == 0, elapsed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profiles", nargs="+", choices=PROFILES, default=list(PROFILES))
    parser.add_argument(
        "--modes", nargs="+", choices=("email", "simple"), default=["email", "simple"]
    )
    parser.add_argument("--jobs", type=int, choices=range(1, 5), default=1)
    parser.add_argument(
        "--prebuilt", action="store_true", help="Use the checked CI frontend artifact."
    )
    args = parser.parse_args()
    profiles = list(dict.fromkeys(args.profiles))
    modes = list(dict.fromkeys(args.modes))
    original = os.environ.get("DATABASE_URL", "")
    connection = urlsplit(original)
    if connection.scheme not in {"postgres", "postgresql"} or connection.hostname not in {
        "localhost",
        "127.0.0.1",
    }:
        parser.error("Use a loopback PostgreSQL development database with CREATE DATABASE access.")
    # Check every allocated port before creating databases or starting any service.
    for profile in profiles:
        index = PROFILES.index(profile)
        for port in (5174 + 10 * index, 8001 + 10 * index):
            with socket.socket() as probe:
                if os.name == "nt":
                    probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                try:
                    probe.bind(("127.0.0.1", port))
                except OSError:
                    parser.error(
                        f"Test port {port} is occupied; existing services will not be reused."
                    )

    environment = os.environ.copy()
    environment.update(
        DJANGO_DEBUG="true",
        DJANGO_STORAGE_BACKEND="local",
        ACCOUNT_VERIFICATION_REQUIRED="false",
        ACCOUNT_REGISTRATION_ENABLED="true",
        MARONITE_FEED_ENABLED="false",
        PDF_COMPRESSED_WRITES="true",
        E2E_PREBUILT="true",
        E2E_ENFORCE_COVERAGE="true",
    )
    node = (
        ROOT / ".local/node/node.exe" if os.name == "nt" else Path(shutil.which("node") or "node")
    )
    npm = (
        [str(node), str(ROOT / ".local/npm/package/bin/npm-cli.js")] if os.name == "nt" else ["npm"]
    )
    environment["PATH"] = str(node.parent) + os.pathsep + environment["PATH"]
    for browser in (
        "C:/Program Files/Google/Chrome/Application/chrome.exe",
        "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    ):
        if os.name == "nt" and Path(browser).is_file():
            environment.setdefault("PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH", browser)
            break
    environment.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(ROOT / ".local/playwright"))
    folder = ROOT / ".cache/system-tests" / secrets.token_hex(6)
    folder.mkdir(parents=True)
    temporary = folder / "tmp"
    temporary.mkdir()
    environment["TEMP"] = environment["TMP"] = str(temporary)
    build_command = (
        [str(node), "scripts/prepare-e2e.mjs"] if args.prebuilt else [*npm, "run", "build"]
    )
    passed, _ = command(build_command, environment, "build", folder, ROOT / "frontend")
    if not passed:
        return 1

    def run_profile(profile):
        index = PROFILES.index(profile)
        results = []
        for mode in modes:
            label = f"{profile}-{mode}"
            # Identifier is generated here and used only by this invocation's finally block.
            database = "system_browser_" + secrets.token_hex(6)
            current = dict(
                environment,
                DATABASE_URL=urlunsplit(connection._replace(path="/" + database)),
                E2E_PROJECT=profile,
                E2E_FRONTEND_PORT=str(5174 + 10 * index),
                E2E_BACKEND_PORT=str(8001 + 10 * index),
                E2E_SIMPLE_ACCOUNTS=str(mode == "simple").lower(),
                ACCOUNT_EMAIL_VERIFICATION_ENABLED=str(mode == "email").lower(),
                ACCOUNT_PASSWORD_RESET_ENABLED=str(mode == "email").lower(),
            )
            with psycopg.connect(original, autocommit=True) as admin:
                admin.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database)))
                journal = folder / f"{label}-database.txt"
                journal.write_text(database, encoding="utf-8")
                try:
                    for setup in (("migrate", "--noinput"), ("seed_initial_data",)):
                        passed, _ = command(
                            [sys.executable, "-B", "backend/manage.py", *setup],
                            current,
                            f"{label}-{setup[0]}",
                            folder,
                        )
                        if not passed:
                            raise RuntimeError(f"{label}: setup failed; see {folder}")
                    passed, elapsed = command(
                        [
                            sys.executable,
                            "-B",
                            "scripts/ci-browser.py",
                            *(SIMPLE_SPECS if mode == "simple" else ()),
                            f"--project={profile}",
                        ],
                        current,
                        label,
                        folder,
                    )
                    results.append(
                        {"profile": profile, "mode": mode, "passed": passed, "seconds": elapsed}
                    )
                finally:
                    admin.execute(
                        sql.SQL("DROP DATABASE {} WITH (FORCE)").format(sql.Identifier(database))
                    )
                    journal.unlink()
                    print(f"{label}: disposable database removed", flush=True)
        return results

    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=args.jobs) as executor:
        results = [result for profile in executor.map(run_profile, profiles) for result in profile]
    import json

    (folder / "timings.json").write_text(
        json.dumps(
            {"jobs": args.jobs, "seconds": time.monotonic() - started, "runs": results}, indent=2
        ),
        encoding="utf-8",
    )
    return int(not all(result["passed"] for result in results))


if __name__ == "__main__":
    raise SystemExit(main())
