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
    fixtures = [sys.executable, str(ROOT / "scripts/e2e-users.py")]
    subprocess.run([*fixtures, "create"], env=environment, cwd=ROOT, check=True)
    try:
        subprocess.run(
            ["npm", "run", "test:e2e", "--", *sys.argv[1:]],
            env=environment,
            cwd=ROOT / "frontend",
            check=True,
        )
    finally:
        subprocess.run([*fixtures, "cleanup"], env=environment, cwd=ROOT, check=True)


if __name__ == "__main__":
    main()
