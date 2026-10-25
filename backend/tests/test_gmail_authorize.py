"""OAuth helper tests never open Google or use the owner's credentials."""

import importlib.util
import json
import threading
from http.client import HTTPConnection
from pathlib import Path
from unittest.mock import patch

import pytest

SPEC = importlib.util.spec_from_file_location(
    "gmail_authorize", Path(__file__).resolve().parents[2] / "scripts/gmail-authorize.py"
)
helper = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(helper)


@pytest.fixture
def local(tmp_path, monkeypatch):
    monkeypatch.setattr(helper, "ROOT", tmp_path)
    folder = tmp_path / ".local"
    folder.mkdir()
    return folder


@pytest.mark.parametrize(
    "value", ["", "not json", "{}", '{"web":{}}', '{"installed":{"client_id":"x"}}']
)
def test_bad_credentials_are_safe(local, value):
    source = local / "client.json"
    source.write_text(value, encoding="utf-8")
    with pytest.raises(ValueError, match="valid Desktop"):
        helper.read_credentials(source)


def test_bom_credentials_and_outside_path(local):
    source = local / "client.json"
    source.write_text(
        json.dumps(
            {
                "installed": {
                    "client_id": "fixture.apps.googleusercontent.com",
                    "client_secret": "private-fixture",
                }
            }
        ),
        encoding="utf-8-sig",
    )
    assert helper.read_credentials(source)["client_id"].startswith("fixture")
    with pytest.raises(ValueError, match="inside ignored"):
        helper.read_credentials(local.parent / "outside.json")


def test_atomic_storage_preserves_old_credentials_on_failure(local):
    output = local / "gmail-hosted-settings.json"
    output.write_text('{"old":true}', encoding="utf-8")
    with patch.object(helper.os, "replace", side_effect=OSError("storage failure")):
        with pytest.raises(OSError):
            helper.write_credentials(output, {"secret": "new-private"})
    assert json.loads(output.read_text()) == {"old": True}
    assert len(list(local.iterdir())) == 1
    helper.write_credentials(output, {"fixture": True})
    assert json.loads(output.read_text()) == {"fixture": True}


def test_invalid_callbacks_do_not_finish_a_valid_authorization(capsys):
    result = {}
    with helper.LoopbackServer(
        ("127.0.0.1", 0), helper.callback_handler("fixture-state", result)
    ) as server:
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        try:
            for path in (
                "/favicon.ico",
                "/?state=wrong&code=private-code",
                "/?state=fixture-state",
                "/?state=fixture-state&state=fixture-state&code=private-code",
            ):
                connection = HTTPConnection("127.0.0.1", server.server_port, timeout=3)
                connection.request("GET", path)
                response = connection.getresponse()
                assert response.status == 400
                response.read()
                connection.close()
                assert not result
            connection = HTTPConnection("127.0.0.1", server.server_port, timeout=3)
            connection.request("GET", "/?state=fixture-state&code=private-code")
            response = connection.getresponse()
            assert response.status == 200
            assert b"private-code" not in response.read()
            assert response.getheader("Cache-Control") == "no-store"
            assert result == {"code": "private-code"}
            connection.close()
        finally:
            server.shutdown()
            thread.join(timeout=3)
    assert "private-code" not in capsys.readouterr().out


def test_denied_consent_finishes_without_a_code():
    result = {}
    with helper.LoopbackServer(
        ("127.0.0.1", 0), helper.callback_handler("state", result)
    ) as server:
        thread = threading.Thread(target=server.handle_request)
        thread.start()
        connection = HTTPConnection("127.0.0.1", server.server_port, timeout=3)
        connection.request("GET", "/?state=state&error=access_denied")
        response = connection.getresponse()
        assert response.status == 200
        response.read()
        connection.close()
        thread.join(timeout=3)
    assert "error" in result and "code" not in result


@pytest.fixture
def fake_authorization(monkeypatch):
    state = {"calls": 0}
    monkeypatch.setattr(helper.sys, "argv", ["gmail-authorize.py"])
    monkeypatch.setattr(
        helper,
        "read_credentials",
        lambda source: {
            "client_id": "fixture.apps.googleusercontent.com",
            "client_secret": "private-fixture",
        },
    )

    def handler(expected, result):
        state.update(expected=expected, result=result)
        return object

    monkeypatch.setattr(helper, "callback_handler", handler)

    class Server:
        server_port = 12345

        def __init__(self, *args):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def handle_request(self):
            state["calls"] += 1
            if state.get("deny"):
                state["result"]["error"] = "Authorization was declined."
            elif state["calls"] == 2:
                state["result"]["code"] = "private-code"

    monkeypatch.setattr(helper, "LoopbackServer", Server)
    return state


def test_main_preserves_pkce_scope_and_ignores_an_invalid_callback(fake_authorization, capsys):
    from urllib.parse import parse_qs, urlsplit

    requests = []

    def exchange(request):
        requests.append(request)
        return {
            "access_token": "private-access",
            "refresh_token": "private-refresh",
            "scope": helper.SCOPE,
        }

    with (
        patch.object(helper, "google_json", side_effect=exchange),
        patch.object(helper, "write_credentials") as write,
    ):
        helper.main()
    output = capsys.readouterr().out
    auth = parse_qs(urlsplit(output.splitlines()[1]).query)
    body = parse_qs(requests[0].data.decode())
    assert auth["scope"] == [helper.SCOPE]
    assert auth["state"] == [fake_authorization["expected"]]
    expected_challenge = (
        helper.base64.urlsafe_b64encode(
            helper.hashlib.sha256(body["code_verifier"][0].encode()).digest()
        )
        .decode()
        .rstrip("=")
    )
    assert auth["code_challenge"] == [expected_challenge]
    assert body["redirect_uri"] == ["http://127.0.0.1:12345/"]
    assert fake_authorization["calls"] == 2
    write.assert_called_once()
    assert not any(
        value in output
        for value in ("private-access", "private-refresh", "private-fixture", "private-code")
    )


def test_main_timeout_never_exchanges_or_replaces_credentials(fake_authorization, monkeypatch):
    ticks = iter((0, 181))
    monkeypatch.setattr(helper.time, "monotonic", lambda: next(ticks))
    with (
        patch.object(helper, "google_json") as exchange,
        patch.object(helper, "write_credentials") as write,
    ):
        with pytest.raises(SystemExit):
            helper.main()
    assert fake_authorization["calls"] == 0
    exchange.assert_not_called()
    write.assert_not_called()


def test_main_declined_consent_keeps_existing_credentials(fake_authorization):
    fake_authorization["deny"] = True
    with (
        patch.object(helper, "google_json") as exchange,
        patch.object(helper, "write_credentials") as write,
    ):
        with pytest.raises(SystemExit):
            helper.main()
    exchange.assert_not_called()
    write.assert_not_called()


def test_main_missing_refresh_token_does_not_replace_credentials(fake_authorization):
    with (
        patch.object(helper, "google_json", return_value={"access_token": "private-access"}),
        patch.object(helper, "write_credentials") as write,
    ):
        with pytest.raises(SystemExit):
            helper.main()
    write.assert_not_called()
