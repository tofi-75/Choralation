"""Real PostgreSQL races for single-use email links; delivery is always mocked."""

import hashlib
import re
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from django.test import Client
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from accounts.models import AccountProfile, AccountToken
from accounts.services import consume_link, issue_link

pytestmark = pytest.mark.django_db(transaction=True)
PASSWORD = "Fictional-email-race!20983"


@pytest.fixture
def email_account(settings):
    settings.APP_PUBLIC_URL = "https://example.test"
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    user = get_user_model().objects.create_user(username="email-race", password=PASSWORD)
    AccountProfile.objects.create(
        user=user, email="race@example.test", username_key="email-race", requires_verification=True
    )
    return user


def parallel(first, second):
    def run(operation):
        close_old_connections()
        try:
            operation()
            return "ok"
        except ValidationError:
            return "invalid"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(run, operation) for operation in (first, second)]
        return [future.result(timeout=15) for future in futures]


def issue(user, purpose):
    messages = []
    with patch(
        "accounts.services.send_mail",
        side_effect=lambda subject, body, *args, **kwargs: messages.append(body) or 1,
    ):
        issue_link(user, purpose)
    return re.search(r"#token=([^\s]+)", messages[0])[1]


def test_concurrent_resends_leave_only_the_latest_usable_link(email_account):
    messages = []
    user = email_account
    with patch(
        "accounts.services.send_mail",
        side_effect=lambda subject, body, *args, **kwargs: messages.append(body) or 1,
    ):

        def operation():
            issue_link(get_user_model().objects.get(pk=user.pk), "verify")

        assert parallel(operation, operation) == ["ok", "ok"]
    assert len(messages) == 2
    assert AccountToken.objects.filter(consumed_at=None).count() == 1
    raw = re.search(r"#token=([^\s]+)", messages[-1])[1]
    assert (
        AccountToken.objects.get(consumed_at=None).digest
        == hashlib.sha256(raw.encode()).hexdigest()
    )


def test_concurrent_verification_consumes_a_token_once(email_account):
    user = email_account
    raw = issue(user, "verify")

    def operation():
        consume_link(raw, "verify", actor=get_user_model().objects.get(pk=user.pk))

    assert sorted(parallel(operation, operation)) == ["invalid", "ok"]
    assert AccountProfile.objects.get(user=user).verified_at
    assert not AccountToken.objects.filter(consumed_at=None).exists()


def test_concurrent_resets_have_one_winner_and_invalidate_prior_session(email_account):
    user = email_account
    profile = user.account_profile
    profile.verified_at = timezone.now()
    profile.save(update_fields=["verified_at"])
    old = Client()
    assert old.login(username=user.username, password=PASSWORD)
    raw = issue(user, "reset")
    choices = ("First-new-password!20983", "Second-new-password!20983")
    assert sorted(
        parallel(
            lambda: consume_link(raw, "reset", password=choices[0]),
            lambda: consume_link(raw, "reset", password=choices[1]),
        )
    ) == ["invalid", "ok"]
    user.refresh_from_db()
    assert sum(user.check_password(value) for value in choices) == 1
    assert old.get("/api/v1/auth/me/").status_code == 403
