"""Small, redacted HTTP/process primitives shared by backup and release jobs."""

import hashlib
import json
import os
import subprocess
import tempfile
import urllib.error
import urllib.request
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit


class OpsError(Exception):
    """Messages must be safe to put in GitHub logs and the Admin panel."""


def private_directory(prefix):
    """Keep sensitive temporary files inside the verified project-owned cache."""
    root = Path(__file__).resolve().parents[2]
    base = (root / ".cache" / "operations").resolve()
    if not base.is_relative_to(root.resolve()):
        raise OpsError("Private operations cache must remain inside the project.")
    base.mkdir(parents=True, exist_ok=True, mode=0o700)
    base.chmod(0o700)
    return tempfile.TemporaryDirectory(prefix=prefix, dir=base)


def now():
    return datetime.now(UTC).isoformat()


def required(name):
    value = os.environ.get(name, "").strip()
    if not value or any(
        marker in value.lower() for marker in ("replace-with", "your_project", "placeholder")
    ):
        raise OpsError(f"Missing usable {name}; enter it privately in GitHub environment settings.")
    return value


def digest(data):
    return hashlib.sha256(data).hexdigest()


def file_digest(path):
    with Path(path).open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def https_url(value):
    parsed = urlsplit(value)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise OpsError("Operations endpoints must be HTTPS origins without embedded credentials.")
    return value.rstrip("/")


def http_json(url, *, token=None, method="GET", body=None, headers=None, timeout=30):
    headers = {"Accept": "application/json", **(headers or {})}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)

    # Never follow redirects carrying privileged headers to another origin.
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, *args, **kwargs):
            return None

    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=timeout) as response:
            return json.load(response)
    except (OSError, ValueError, urllib.error.HTTPError) as error:
        status = getattr(error, "code", "network")
        raise OpsError(
            f"Operations HTTP request failed ({status}); provider details suppressed."
        ) from None


def process(args, *, env=None, stdin=None, timeout=900):
    try:
        result = subprocess.run(args, input=stdin, env=env, capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired):
        raise OpsError("Operations tool unavailable or timed out; details suppressed.") from None
    if result.returncode:
        raise OpsError("Operations tool failed; private output suppressed.")
    return result.stdout
