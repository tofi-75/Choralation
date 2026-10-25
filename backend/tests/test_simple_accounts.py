"""Simple accounts never equate an unverified email with verified ownership."""

import hashlib
import importlib.util
from datetime import timedelta
from pathlib import Path
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.test import Client
from django.utils import timezone

from accounts.models import AccountProfile, AccountToken
from accounts.services import EmailUnavailable, consume_link, issue_link

pytestmark = pytest.mark.django_db
PASSWORD = "Simple-fictional-password!62839"


@pytest.fixture
def simple(settings):
    settings.ACCOUNT_REGISTRATION_ENABLED = True
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    settings.ACCOUNT_PASSWORD_RESET_ENABLED = False
    settings.ACCOUNT_VERIFICATION_REQUIRED = True
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"


def member(name="simple-member", verified=False):
    user = get_user_model().objects.create_user(username=name, password=PASSWORD)
    AccountProfile.objects.create(
        user=user,
        username_key=name,
        email=f"{name}@example.test",
        requires_verification=True,
        verified_at=timezone.now() if verified else None,
    )
    return user


def post(client, route, data):
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf_token"]
    return client.post(route, data, content_type="application/json", HTTP_X_CSRFTOKEN=csrf)


def test_registration_immediately_authenticates_without_verifying_or_sending(simple):
    client = Client(enforce_csrf_checks=True)
    data = {
        "username": "simple-new",
        "email": "SIMPLE@Example.Test",
        "password": PASSWORD,
        "password_confirmation": PASSWORD,
    }
    assert (
        client.post("/api/v1/auth/register/", data, content_type="application/json").status_code
        == 403
    )
    with patch("accounts.services.send_mail") as send:
        response = post(client, "/api/v1/auth/register/", data)
        send.assert_not_called()
    assert response.status_code == 201
    assert response.json()["email_verified"] is False
    assert response.json()["verification_required"] is False
    assert response.json()["role"] == "Viewer"
    assert response.json()["can_create_choirs"] is False
    assert client.get("/api/v1/hymns/").status_code == 200
    assert client.get("/api/v1/auth/me/").json()["id"] == response.json()["id"]
    profile = AccountProfile.objects.get(user_id=response.json()["id"])
    assert profile.verified_at is None and profile.requires_verification is False
    assert not AccountToken.objects.exists()


def test_pending_accounts_can_use_email_or_username_without_changing_evidence(simple):
    user = member()
    for identifier in (user.username, user.account_profile.email.upper()):
        client = Client(enforce_csrf_checks=True)
        response = post(
            client, "/api/v1/auth/login/", {"username": identifier, "password": PASSWORD}
        )
        assert response.status_code == 200
        assert response.json()["email_verified"] is False
        assert response.json()["verification_required"] is False
        assert client.get("/api/v1/choirs/").status_code == 200
    profile = AccountProfile.objects.get(user=user)
    assert profile.requires_verification and profile.verified_at is None
    assert not profile.can_create_choirs
    assert not user.groups.exists()


def test_verified_timestamp_is_retained_in_simple_mode(simple):
    user = member(verified=True)
    timestamp = user.account_profile.verified_at
    client = Client()
    assert client.login(username=user.account_profile.email, password=PASSWORD)
    assert client.get("/api/v1/auth/me/").json()["email_verified"] is True
    assert AccountProfile.objects.get(user=user).verified_at == timestamp


@pytest.mark.parametrize(
    "route,data",
    [
        ("verify-email/", {"token": "old-fictional-link"}),
        ("resend-verification/", {}),
        ("email/", {"email": "replacement@example.test"}),
        ("password-reset/request/", {"email": "simple-member@example.test"}),
        ("password-reset/confirm/", {"token": "old-fictional-link", "password": PASSWORD + "New"}),
    ],
)
def test_disabled_actions_do_not_send_consume_or_change_accounts(simple, route, data):
    user = member()
    token = AccountToken.objects.create(
        user=user,
        digest=hashlib.sha256(b"old-fictional-link").hexdigest(),
        purpose="verify",
        email=user.account_profile.email,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    old_password = user.password
    client = Client(enforce_csrf_checks=True)
    client.force_login(user)
    with patch("accounts.services.send_mail") as send:
        response = post(client, "/api/v1/auth/" + route, data)
        send.assert_not_called()
    assert response.status_code == 503
    assert response.json()["code"] == "email_unavailable"
    token.refresh_from_db()
    user.refresh_from_db()
    assert token.consumed_at is None and user.password == old_password
    assert user.account_profile.verified_at is None
    assert client.get("/api/v1/auth/me/").json()["id"] == user.pk


@pytest.mark.parametrize("purpose", ["verify", "reset"])
def test_service_guards_cannot_be_bypassed(simple, purpose):
    user = member()
    with patch("accounts.services.send_mail") as send:
        with pytest.raises(EmailUnavailable):
            issue_link(user, purpose)
        with pytest.raises(EmailUnavailable):
            consume_link(
                "old-fictional-link",
                purpose,
                actor=user,
                password=PASSWORD + "New",
                email_sign_in=True,
            )
        send.assert_not_called()
    assert not AccountToken.objects.exists()


def test_old_links_cannot_authenticate_anonymous_clients(simple):
    user = member()
    AccountToken.objects.create(
        user=user,
        digest=hashlib.sha256(b"old-fictional-link").hexdigest(),
        purpose="verify",
        email=user.account_profile.email,
        expires_at=timezone.now() + timedelta(hours=1),
    )
    client = Client(enforce_csrf_checks=True)
    assert (
        post(client, "/api/v1/auth/verify-email/", {"token": "old-fictional-link"}).status_code
        == 503
    )
    assert client.get("/api/v1/auth/me/").status_code == 403


def test_simple_password_change_requires_password_and_invalidates_other_sessions(simple):
    user = member()
    client, other = Client(enforce_csrf_checks=True), Client()
    assert client.login(username=user.username, password=PASSWORD)
    assert other.login(username=user.username, password=PASSWORD)
    assert (
        post(
            client,
            "/api/v1/auth/password/",
            {"current_password": "wrong", "password": PASSWORD + "New"},
        ).status_code
        == 400
    )
    assert (
        post(
            client,
            "/api/v1/auth/password/",
            {"current_password": PASSWORD, "password": PASSWORD + "New"},
        ).status_code
        == 200
    )
    assert other.get("/api/v1/auth/me/").status_code == 403
    assert not Client().login(username=user.username, password=PASSWORD)
    assert Client().login(username=user.username, password=PASSWORD + "New")
    assert AccountProfile.objects.get(user=user).verified_at is None


def test_simple_mode_rejects_disabled_users_and_duplicate_email(simple):
    user = member()
    user.is_active = False
    user.save()
    assert not Client().login(username=user.account_profile.email, password=PASSWORD)
    response = post(
        Client(enforce_csrf_checks=True),
        "/api/v1/auth/register/",
        {
            "username": "duplicate-email",
            "email": user.account_profile.email.upper(),
            "password": PASSWORD,
            "password_confirmation": PASSWORD,
        },
    )
    assert response.status_code == 400
    assert get_user_model().objects.count() == 1


def test_discovery_describes_simple_mode(simple):
    assert Client().get("/api/v1/auth/config/").json() == {
        "registration_enabled": True,
        "email_verification_enabled": False,
        "password_reset_enabled": False,
    }


@pytest.mark.parametrize("purpose", ["verify", "reset"])
def test_email_switches_are_independent(simple, settings, purpose):
    user = member(verified=True)
    settings.APP_PUBLIC_URL = "https://example.test"
    setattr(
        settings,
        "ACCOUNT_EMAIL_VERIFICATION_ENABLED"
        if purpose == "verify"
        else "ACCOUNT_PASSWORD_RESET_ENABLED",
        True,
    )
    with patch("accounts.services.send_mail", return_value=1) as send:
        issue_link(user, purpose)
        assert send.call_count == 1
        with pytest.raises(EmailUnavailable):
            issue_link(user, "reset" if purpose == "verify" else "verify")


def test_hosted_password_helper_uses_hidden_django_prompt(monkeypatch):
    path = Path(__file__).resolve().parents[2] / "scripts" / "hosted-admin.py"
    spec = importlib.util.spec_from_file_location("hosted_simple_test", path)
    helper = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(helper)
    monkeypatch.setattr("sys.argv", [str(path), "change-password", "--username", "existing-user"])
    monkeypatch.setattr("builtins.input", lambda _: "HOSTED")
    with (
        patch.object(helper, "hosted_environment", return_value=({}, "test.pooler.supabase.com")),
        patch.object(helper.subprocess, "run") as run,
    ):
        run.return_value.returncode = 0
        with pytest.raises(SystemExit) as result:
            helper.main()
        assert result.value.code == 0
        assert run.call_args.args[0][-2:] == ["changepassword", "existing-user"]
