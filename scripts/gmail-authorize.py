"""Owner-run send-only Gmail authorization; secrets remain in ignored .local."""

import argparse
import base64
import hashlib
import json
import os
import secrets
import sys
import tempfile
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit
from urllib.request import Request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
from accounts.gmail_transport import (  # noqa: E402
    SCOPE,
    TOKEN_URL,
    GmailDeliveryError,
    google_json,
    validate_token_response,
)


def read_credentials(source):
    local = ROOT / ".local"
    if not local.resolve().is_relative_to(ROOT.resolve()) or not source.resolve().is_relative_to(
        local.resolve()
    ):
        raise ValueError("Keep the Desktop OAuth client file inside ignored .local.")
    try:
        if source.stat().st_size > 65536:
            raise ValueError
        data = json.loads(source.read_text(encoding="utf-8-sig"))["installed"]
        if not isinstance(data, dict) or not all(
            isinstance(data.get(key), str) and data[key].strip()
            for key in ("client_id", "client_secret")
        ):
            raise ValueError
        if not data["client_id"].endswith(".apps.googleusercontent.com"):
            raise ValueError
        return data
    except (OSError, ValueError, KeyError, TypeError):
        raise ValueError(
            "Download a valid Desktop OAuth client JSON; the file is missing, empty or invalid."
        ) from None


def callback_handler(state, result):
    class Callback(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_GET(self):
            try:
                parsed = urlsplit(self.path)
                if parsed.path != "/" or len(self.path) > 8192:
                    raise ValueError
                query = parse_qs(parsed.query, max_num_fields=8)
                if len(query.get("state", [])) != 1 or not secrets.compare_digest(
                    query["state"][0], state
                ):
                    raise ValueError
                if query.get("error"):
                    result["error"] = "Authorization was declined. No credentials were changed."
                elif len(query.get("code", [])) == 1 and 0 < len(query["code"][0]) <= 4096:
                    result["code"] = query["code"][0]
                else:
                    raise ValueError
            except (ValueError, TypeError):
                self.send_response(400)
                self.end_headers()
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.end_headers()
            self.wfile.write(b"Return to your terminal. This page contains no credentials.")

    return Callback


class LoopbackServer(HTTPServer):
    def get_request(self):
        connection, address = super().get_request()
        connection.settimeout(2)
        return connection, address


def write_credentials(output, values):
    local = ROOT / ".local"
    if output.parent.resolve() != local.resolve() or not local.resolve().is_relative_to(
        ROOT.resolve()
    ):
        raise ValueError("Credential output must remain in ignored .local.")
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=local, delete=False
        ) as handle:
            temporary = Path(handle.name)
            os.chmod(temporary, 0o600)
            json.dump(values, handle, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, output)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--credentials", default=str(ROOT / ".local/gmail-client.json"))
    options = parser.parse_args()
    try:
        credentials = read_credentials(Path(options.credentials))
    except ValueError as error:
        parser.error(str(error))
    state, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    result = {}
    with LoopbackServer(("127.0.0.1", 0), callback_handler(state, result)) as server:
        redirect = f"http://127.0.0.1:{server.server_port}/"
        url = "https://accounts.google.com/o/oauth2/v2/auth?" + urlencode(
            {
                "client_id": credentials["client_id"],
                "redirect_uri": redirect,
                "response_type": "code",
                "scope": SCOPE,
                "access_type": "offline",
                "prompt": "consent",
                "state": state,
                "code_challenge_method": "S256",
                "code_challenge": base64.urlsafe_b64encode(
                    hashlib.sha256(verifier.encode()).digest()
                )
                .decode()
                .rstrip("="),
            }
        )
        print("Open this Google consent URL yourself and authorize the sending account:\n" + url)
        deadline = time.monotonic() + 180
        while not result and time.monotonic() < deadline:
            server.timeout = min(1, max(0.1, deadline - time.monotonic()))
            server.handle_request()
    if "code" not in result:
        parser.exit(
            1,
            result.get("error", "Authorization timed out. No credentials were changed.") + "\n",
        )
    body = urlencode(
        {
            "client_id": credentials["client_id"],
            "client_secret": credentials["client_secret"],
            "code": result["code"],
            "code_verifier": verifier,
            "redirect_uri": redirect,
            "grant_type": "authorization_code",
        }
    ).encode()
    try:
        token = google_json(Request(TOKEN_URL, data=body))
        validate_token_response(token)
        if not isinstance(token.get("refresh_token"), str) or not token["refresh_token"].strip():
            raise GmailDeliveryError("missing_refresh_token")
        write_credentials(
            ROOT / ".local/gmail-hosted-settings.json",
            {
                "GMAIL_CLIENT_ID": credentials["client_id"],
                "GMAIL_CLIENT_SECRET": credentials["client_secret"],
                "GMAIL_REFRESH_TOKEN": token["refresh_token"],
            },
        )
    except GmailDeliveryError as error:
        parser.exit(
            1,
            f"Authorization exchange failed ({error.category}). Existing credentials were not replaced.\n",
        )
    except OSError:
        parser.exit(1, "Could not store credentials. No credential values were printed.\n")
    print(
        "Stored private settings in .local/gmail-hosted-settings.json. Never commit or share this file."
    )


if __name__ == "__main__":
    main()
