"""Every Google failure is mocked; this suite never loads real credentials."""

import base64
import io
import json
import ssl
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs
from urllib.request import Request

import pytest
from django.core.mail import EmailMessage

from accounts.email_backend import GmailBackend
from accounts.gmail_transport import (
    SCOPE,
    SEND_URL,
    TOKEN_URL,
    GmailDeliveryError,
    NoRedirect,
    google_json,
)


@pytest.fixture(autouse=True)
def gmail_settings(settings):
    settings.GMAIL_CLIENT_ID = "fixture-client"
    settings.GMAIL_CLIENT_SECRET = "fixture-secret"
    settings.GMAIL_REFRESH_TOKEN = "fixture-refresh"
    settings.DEFAULT_FROM_EMAIL = "sender@example.test"
    settings.APP_PUBLIC_URL = "https://example.test"


def response(value, status=200):
    item = io.BytesIO(value if isinstance(value, bytes) else json.dumps(value).encode())
    item.status = status
    return item


def message():
    return EmailMessage(
        "Fixture", "Verification body", "sender@example.test", ["member@example.test"]
    )


def test_gmail_uses_https_refresh_and_send_only_transport():
    calls = []

    def respond(request, timeout):
        calls.append(request)
        assert timeout == 10
        return response(
            {"access_token": "fixture-access", "scope": SCOPE}
            if len(calls) == 1
            else {"id": "message-id"}
        )

    with patch("accounts.gmail_transport.urlopen", side_effect=respond):
        assert GmailBackend().send_messages([message()]) == 1
    assert calls[0].full_url == TOKEN_URL
    assert parse_qs(calls[0].data.decode())["grant_type"] == ["refresh_token"]
    assert calls[1].full_url == SEND_URL
    assert calls[1].get_header("Authorization") == "Bearer fixture-access"
    mime = base64.urlsafe_b64decode(json.loads(calls[1].data)["raw"]).decode()
    assert "To: member@example.test" in mime and "Verification body" in mime
    assert "fixture-secret" not in mime and "fixture-refresh" not in mime


@pytest.mark.parametrize("status", [301, 302, 307, 308, 400, 401, 403, 429, 500, 503])
def test_provider_errors_are_safe_and_never_retried(status, caplog):
    error = HTTPError(
        TOKEN_URL,
        status,
        "fixture-secret fixture-refresh",
        {},
        io.BytesIO(b"private-provider-body"),
    )
    with patch("accounts.gmail_transport.urlopen", side_effect=error) as request:
        with pytest.raises(GmailDeliveryError) as caught:
            GmailBackend().send_messages([message()])
    assert request.call_count == 1
    assert not any(
        secret in str(caught.value) + caplog.text
        for secret in ("fixture-secret", "fixture-refresh", "private-provider-body")
    )
    assert caught.value.__suppress_context__


@pytest.mark.parametrize(
    "error",
    [TimeoutError("private-timeout"), URLError("private-network"), ssl.SSLError("private-tls")],
)
def test_network_and_tls_errors_are_sanitized(error):
    with patch("accounts.gmail_transport.urlopen", side_effect=error) as request:
        with pytest.raises(GmailDeliveryError, match="network"):
            GmailBackend().send_messages([message()])
    assert request.call_count == 1


@pytest.mark.parametrize(
    "token",
    [
        b"not-json",
        [],
        {},
        {"access_token": ""},
        {"access_token": 4},
        {"access_token": "x", "scope": "https://mail.google.com/"},
        {"access_token": "x", "scope": "gmail.send"},
        b"x" * 65537,
    ],
    ids=[
        "invalid-json",
        "not-object",
        "missing",
        "empty",
        "number",
        "broad",
        "wrong-scope",
        "oversize",
    ],
)
def test_invalid_or_excessively_scoped_token_responses_are_rejected(token):
    with patch("accounts.gmail_transport.urlopen", return_value=response(token)) as request:
        with pytest.raises(GmailDeliveryError):
            GmailBackend().send_messages([message()])
    assert request.call_count == 1


@pytest.mark.parametrize(
    "field,value",
    [
        ("GMAIL_CLIENT_ID", ""),
        ("GMAIL_CLIENT_SECRET", ""),
        ("GMAIL_REFRESH_TOKEN", ""),
        ("DEFAULT_FROM_EMAIL", "bad"),
        ("DEFAULT_FROM_EMAIL", "sender@example.test\nBcc: victim@example.test"),
        ("APP_PUBLIC_URL", "https://user:password@example.test"),
        ("APP_PUBLIC_URL", "https://example.test/#secret"),
        ("APP_PUBLIC_URL", "http://example.test"),
    ],
)
def test_invalid_configuration_does_not_contact_google(settings, field, value):
    setattr(settings, field, value)
    with patch("accounts.gmail_transport.urlopen") as request:
        with pytest.raises(GmailDeliveryError):
            GmailBackend().send_messages([message()])
        assert GmailBackend(fail_silently=True).send_messages([message()]) == 0
    request.assert_not_called()


def test_partial_batch_and_fail_silently_contract():
    replies = [
        response({"access_token": "fixture-access"}),
        response({"id": "first"}),
        TimeoutError("private"),
    ]
    with patch("accounts.gmail_transport.urlopen", side_effect=replies) as request:
        assert GmailBackend(fail_silently=True).send_messages([message(), message()]) == 1
        assert request.call_count == 3
    with patch(
        "accounts.gmail_transport.urlopen",
        side_effect=[
            response({"access_token": "x"}),
            response({"id": "first"}),
            TimeoutError("private"),
        ],
    ):
        with pytest.raises(GmailDeliveryError):
            GmailBackend().send_messages([message(), message()])


def test_empty_batch_and_no_recipients_do_not_contact_google():
    with patch("accounts.gmail_transport.urlopen") as request:
        assert GmailBackend().send_messages([]) == 0
        assert GmailBackend().send_messages([EmailMessage("No recipient", "Body")]) == 0
    request.assert_not_called()


def test_sender_mismatch_and_invalid_send_response_do_not_claim_success():
    wrong = message()
    wrong.from_email = "other@example.test"
    with patch(
        "accounts.gmail_transport.urlopen", return_value=response({"access_token": "x"})
    ) as request:
        with pytest.raises(GmailDeliveryError):
            GmailBackend().send_messages([wrong])
        assert request.call_count == 1
    with patch(
        "accounts.gmail_transport.urlopen",
        side_effect=[response({"access_token": "x"}), response({})],
    ):
        with pytest.raises(GmailDeliveryError):
            GmailBackend().send_messages([message()])


def test_redirects_and_arbitrary_endpoints_are_not_allowed():
    assert (
        NoRedirect().redirect_request(None, None, 302, "Found", {}, "https://attacker.test") is None
    )
    with patch("accounts.gmail_transport.urlopen") as request:
        with pytest.raises(GmailDeliveryError, match="configuration"):
            google_json(Request("https://attacker.test", data=b"secret"))
    request.assert_not_called()
