"""Run real browser tests on an isolated CI database, cleaning owned fixtures."""

import os
import secrets
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def main():
    environment = os.environ.copy()
    environment.update(
        {
            "E2E_USER_SUFFIX": secrets.token_hex(6),
            "E2E_PASSWORD": secrets.token_hex(24) + "!Browser",
        }
    )
    environment["E2E_MEDIA_ROOT"] = str(
        ROOT / ".cache" / "e2e-media" / environment["E2E_USER_SUFFIX"]
    )
    environment["DJANGO_MEDIA_ROOT"] = environment["E2E_MEDIA_ROOT"]
    environment["DJANGO_STORAGE_BACKEND"] = "local"
    environment["ACCOUNT_VERIFICATION_REQUIRED"] = "false"
    environment["EMAIL_FILE_PATH"] = str(
        ROOT / ".cache" / "e2e-emails" / environment["E2E_USER_SUFFIX"]
    )
    if environment.get("E2E_ENFORCE_COVERAGE") == "true":
        mode = "simple" if environment.get("E2E_SIMPLE_ACCOUNTS") == "true" else "email"
        project = environment["E2E_PROJECT"]
        environment["E2E_REPORT_DIR"] = str(
            ROOT / ".cache" / "browser-reports" / f"{project}-{mode}"
        )
    fixtures = [sys.executable, str(ROOT / "scripts/e2e-users.py")]
    subprocess.run([*fixtures, "create"], env=environment, cwd=ROOT, check=True)
    try:
        subprocess.run(
            [
                *(
                    [
                        str(ROOT / ".local/node/node.exe"),
                        str(ROOT / ".local/npm/package/bin/npm-cli.js"),
                    ]
                    if os.name == "nt"
                    else ["npm"]
                ),
                "run",
                "test:e2e",
                "--",
                *sys.argv[1:],
            ],
            env=environment,
            cwd=ROOT / "frontend",
            check=True,
        )
    finally:
        subprocess.run([*fixtures, "cleanup"], env=environment, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
