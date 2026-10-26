"""Replace production app containers while PostgreSQL and the TLS S3 store remain."""

import base64
import hashlib
import json
import os
import secrets
import subprocess
import sys
import time
from pathlib import Path

import boto3
from botocore.config import Config

ROOT = Path(__file__).resolve().parent.parent
EMULATOR = (
    "motoserver/moto:5.1.11@sha256:8ca337023ebaa5c0b8b33503b178d4db3326fca184551d6f47b07b8dd8532644"
)


def run(args, **kwargs):
    return subprocess.run(args, check=True, cwd=ROOT, **kwargs)


def main():
    if sys.platform != "linux" or os.environ.get("GITHUB_ACTIONS") != "true":
        raise RuntimeError("This container harness requires the isolated Linux GitHub Actions job.")
    suffix = secrets.token_hex(5)
    app = f"choralation-ci-{suffix}-app"
    emulator = f"choralation-ci-{suffix}-s3"
    certs = ROOT / ".cache" / f"storage-certs-{suffix}"
    certs.mkdir(parents=True)
    run(
        [
            "openssl",
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            str(certs / "private.key"),
            "-out",
            str(certs / "public.crt"),
            "-days",
            "2",
            "-subj",
            "/CN=localhost",
            "-addext",
            "subjectAltName=DNS:localhost,IP:127.0.0.1",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    (certs / "private.key").chmod(
        0o644
    )  # Fictional CI certificate only; not an application credential.
    environment = {
        "DJANGO_SECRET_KEY": "ci-only-production-secret-00000000000000000000000000000000",
        "DJANGO_DEBUG": "false",
        "DJANGO_ALLOWED_HOSTS": "127.0.0.1,localhost,testserver",
        "DJANGO_TRUST_PROXY_HTTPS": "true",
        "DJANGO_STORAGE_BACKEND": "s3",
        "ACCOUNT_REGISTRATION_ENABLED": "true",
        "ACCOUNT_EMAIL_VERIFICATION_ENABLED": "false",
        "ACCOUNT_PASSWORD_RESET_ENABLED": "false",
        "MARONITE_FEED_ENABLED": "false",
        "DATABASE_URL": "postgresql://choralation:ci-only-password@127.0.0.1:5432/choralation_production_smoke",
        "AWS_STORAGE_BUCKET_NAME": "sheet-music",
        "AWS_S3_ENDPOINT_URL": "https://127.0.0.1:5001",
        "AWS_S3_REGION_NAME": "us-east-1",
        "AWS_ACCESS_KEY_ID": "ci-only-storage-key",
        "AWS_SECRET_ACCESS_KEY": "ci-only-storage-secret",
        "AWS_CA_BUNDLE": "/ci-certs/public.crt",
        "PORT": "10000",
    }

    def remove_app():
        subprocess.run(
            ["docker", "rm", "-f", app], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )

    def start_app():
        args = [
            "docker",
            "run",
            "-d",
            "--name",
            app,
            "--network",
            "host",
            "-v",
            f"{certs}:/ci-certs:ro",
        ]
        for key, value in environment.items():
            args += ["-e", f"{key}={value}"]
        run([*args, "choralation:ci"], stdout=subprocess.DEVNULL)
        run([sys.executable, "scripts/production-smoke.py", "http://127.0.0.1:10000"])
        run(
            ["docker", "cp", "scripts/container-pdf-probe.py", app + ":/tmp/pdf-probe.py"],
            stdout=subprocess.DEVNULL,
        )

    def probe(data):
        result = subprocess.run(
            ["docker", "exec", "-i", app, "python", "/tmp/pdf-probe.py"],
            input=json.dumps(data),
            text=True,
            capture_output=True,
        )
        if result.returncode:
            print(result.stderr)
            raise RuntimeError("Isolated container PDF acceptance failed.")
        return json.loads(result.stdout)

    try:
        run(
            [
                "docker",
                "run",
                "-d",
                "--name",
                emulator,
                "--network",
                "host",
                "-v",
                f"{certs}:/certs:ro",
                "--entrypoint",
                "moto_server",
                EMULATOR,
                "-H",
                "0.0.0.0",
                "-p",
                "5001",
                "-c",
                "/certs/public.crt",
                "-k",
                "/certs/private.key",
            ],
            stdout=subprocess.DEVNULL,
        )
        s3 = boto3.client(
            "s3",
            endpoint_url=environment["AWS_S3_ENDPOINT_URL"],
            aws_access_key_id=environment["AWS_ACCESS_KEY_ID"],
            aws_secret_access_key=environment["AWS_SECRET_ACCESS_KEY"],
            region_name="us-east-1",
            verify=str(certs / "public.crt"),
            config=Config(
                connect_timeout=1,
                read_timeout=2,
                retries={"max_attempts": 0},
                s3={"addressing_style": "path"},
            ),
        )
        for _ in range(30):
            try:
                s3.create_bucket(Bucket="sheet-music")
                break
            except Exception:
                time.sleep(1)
        else:
            raise RuntimeError("TLS S3 emulator did not start.")
        username = "container-check-" + suffix

        def payload(phase, name):
            content = (ROOT / "frontend/tests/fixtures" / name).read_bytes()
            return {
                "phase": phase,
                "username": username,
                "pdf": base64.b64encode(content).decode(),
                "sha256": hashlib.sha256(content).hexdigest(),
            }

        first = payload("create", "two-page-sheet-music.pdf")
        start_app()
        state = probe(first)
        remove_app()
        start_app()
        probe({**first, **state, "phase": "read"})
        replacement = payload("replace", "sheet-music.pdf")
        state = probe({**replacement, "id": state["id"]})
        remove_app()
        start_app()
        probe({**replacement, **state, "phase": "cleanup"})
        assert not s3.list_objects_v2(Bucket="sheet-music").get("Contents"), (
            "Run-owned objects leaked"
        )
        print(
            "PDF bytes, references and private permissions survived TWO fresh application containers; replacement and cleanup passed."
        )
    except Exception:
        subprocess.run(["docker", "logs", app])
        raise
    finally:
        remove_app()
        subprocess.run(
            ["docker", "rm", "-f", emulator], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
        )


if __name__ == "__main__":
    main()
