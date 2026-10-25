"""Account lifecycle and two-choir privacy against real PostgreSQL constraints."""

import re
from datetime import timedelta
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import Client
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import AccountProfile, AccountToken
from accounts.security import limit
from accounts.services import consume_link, issue_link, set_email
from choirs.models import JoinCode, JoinRequest, Membership
from choirs.services import change_member, create_choir, decide, regenerate, request_join
from hymns.models import Hymn, Language, MassPlacement
from masses.models import Mass, MassHymnSelection
from masses.services import transition_mass

pytestmark = pytest.mark.django_db
PASSWORD = "Fictional-account-Password!20983"


@pytest.fixture
def enabled(settings):
    settings.ACCOUNT_REGISTRATION_ENABLED = True
    settings.ACCOUNT_VERIFICATION_REQUIRED = True
    settings.EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"
    settings.APP_PUBLIC_URL = "https://example.test"


def account(name, *, planner=False, verified=True):
    user = get_user_model().objects.create_user(username=name, password=PASSWORD)
    AccountProfile.objects.create(
        user=user,
        email=f"{name}@example.test",
        username_key=name.lower(),
        verified_at=timezone.now() if verified else None,
        requires_verification=True,
        can_create_choirs=planner,
    )
    return user


def api_for(user, choir=None):
    api = APIClient(**({"HTTP_X_CHOIR_ID": str(choir.pk)} if choir else {}))
    api.force_authenticate(user)
    return api


def raw_token():
    return re.search(r"#token=([^\s]+)", mail.outbox[-1].body)[1]


def test_registration_csrf_verification_gate_and_link_is_not_consumed_on_get(enabled):
    api = Client(enforce_csrf_checks=True)
    data = {
        "username": "new-member",
        "email": "New@Example.Test",
        "password": PASSWORD,
        "password_confirmation": PASSWORD,
    }
    assert (
        api.post("/api/v1/auth/register/", data, content_type="application/json").status_code == 403
    )
    csrf = api.get("/api/v1/auth/csrf/").json()["csrf_token"]
    result = api.post(
        "/api/v1/auth/register/", data, content_type="application/json", HTTP_X_CSRFTOKEN=csrf
    )
    assert result.status_code == 201
    assert result.json()["verification_required"]
    assert not result.json()["can_create_choirs"]
    token = raw_token()
    assert not AccountToken.objects.filter(digest=token).exists()
    assert api.get("/api/v1/hymns/").status_code == 403
    assert api.get("/api/v1/languages/").status_code == 403
    assert api.get("/api/v1/choirs/").status_code == 403
    api.get("/verify-email/#token=" + token)
    assert AccountToken.objects.get().consumed_at is None
    csrf = api.get("/api/v1/auth/csrf/").json()["csrf_token"]
    assert (
        api.post(
            "/api/v1/auth/verify-email/",
            {"token": token},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        ).status_code
        == 200
    )
    assert api.get("/api/v1/hymns/").status_code == 200
    csrf = api.get("/api/v1/auth/csrf/").json()["csrf_token"]
    assert (
        api.post(
            "/api/v1/auth/verify-email/",
            {"token": token},
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        ).status_code
        == 400
    )


def test_email_login_is_case_insensitive_and_requires_verification(enabled):
    user = account("login-email", verified=False)
    api = APIClient()
    assert (
        api.post(
            "/api/v1/auth/login/",
            {"username": "LOGIN-EMAIL@example.test", "password": PASSWORD},
            format="json",
        ).status_code
        == 400
    )
    profile = user.account_profile
    profile.verified_at = timezone.now()
    profile.save()
    assert (
        api.post(
            "/api/v1/auth/login/",
            {"username": "LOGIN-EMAIL@example.test", "password": PASSWORD},
            format="json",
        ).status_code
        == 200
    )
    assert (
        api.post(
            "/api/v1/auth/login/", {"username": user.username, "password": PASSWORD}, format="json"
        ).status_code
        == 200
    )


def test_link_ownership_expiry_replacement_and_email_change(enabled):
    user = account("unverified", verified=False)
    other = account("other")
    issue_link(user, "verify")
    first = raw_token()
    with pytest.raises(Exception, match="Sign out of the other account"):
        consume_link(first, "verify", actor=other)
    issue_link(user, "verify")
    second = raw_token()
    with pytest.raises(Exception, match="invalid or expired"):
        consume_link(first, "verify", actor=user)
    AccountToken.objects.filter(consumed_at=None).update(
        expires_at=timezone.now() - timedelta(seconds=1)
    )
    with pytest.raises(Exception, match="invalid or expired"):
        consume_link(second, "verify", actor=user)


def test_verification_link_signs_in_anonymous_owner_with_csrf_and_rejects_replay(enabled):
    user = account("email-link-owner", verified=False)
    issue_link(user, "verify")
    token = raw_token()
    api = Client(enforce_csrf_checks=True)
    endpoint = "/api/v1/auth/verify-email/"
    assert api.post(endpoint, {"token": token}, content_type="application/json").status_code == 403
    assert api.get(endpoint).status_code == 405
    assert AccountToken.objects.get().consumed_at is None
    csrf = api.get("/api/v1/auth/csrf/").json()["csrf_token"]
    response = api.post(
        endpoint, {"token": token}, content_type="application/json", HTTP_X_CSRFTOKEN=csrf
    )
    assert response.status_code == 200
    assert response.json()["email_verified"]
    assert api.get("/api/v1/auth/me/").json()["id"] == user.pk
    assert api.get("/api/v1/hymns/").status_code == 200
    assert (
        api.post(
            endpoint, {"token": token}, content_type="application/json", HTTP_X_CSRFTOKEN=csrf
        ).status_code
        == 403
    )  # Sign-in rotates the CSRF cookie.
    fresh_csrf = api.get("/api/v1/auth/csrf/").json()["csrf_token"]
    assert (
        api.post(
            endpoint, {"token": token}, content_type="application/json", HTTP_X_CSRFTOKEN=fresh_csrf
        ).status_code
        == 400
    )
    outsider = APIClient()
    assert outsider.post(endpoint, {"token": token}, format="json").status_code == 400
    assert outsider.get("/api/v1/auth/me/").status_code == 403


def test_verification_link_never_silently_switches_another_signed_in_account(enabled):
    user = account("verification-target", verified=False)
    other = account("signed-in-other")
    issue_link(user, "verify")
    api = Client(enforce_csrf_checks=True)
    assert api.login(username=other.username, password=PASSWORD)
    csrf = api.get("/api/v1/auth/csrf/").json()["csrf_token"]
    response = api.post(
        "/api/v1/auth/verify-email/",
        {"token": raw_token()},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=csrf,
    )
    assert response.status_code == 400
    assert api.get("/api/v1/auth/me/").json()["id"] == other.pk
    assert AccountToken.objects.get().consumed_at is None
    assert AccountProfile.objects.get(user=user).verified_at is None


@pytest.mark.parametrize("invalid", ["expired", "disabled", "changed-email", "reset-token"])
def test_invalid_verification_link_cannot_create_a_session(enabled, invalid):
    user = account("invalid-link-owner", verified=invalid == "reset-token")
    issue_link(user, "reset" if invalid == "reset-token" else "verify")
    token = raw_token()
    if invalid == "expired":
        AccountToken.objects.update(expires_at=timezone.now() - timedelta(seconds=1))
    elif invalid == "disabled":
        user.is_active = False
        user.save(update_fields=["is_active"])
    elif invalid == "changed-email":
        set_email(user, "replacement@example.test")
    api = APIClient()
    assert (
        api.post("/api/v1/auth/verify-email/", {"token": token}, format="json").status_code == 400
    )
    assert api.get("/api/v1/auth/me/").status_code == 403


def test_reset_preserves_generic_responses_and_invalidates_existing_sessions(enabled):
    user = account("reset-user")
    api = APIClient()
    assert api.login(username=user.username, password=PASSWORD)
    other = APIClient()
    assert other.login(username=user.username, password=PASSWORD)
    result = api.post(
        "/api/v1/auth/password-reset/request/", {"email": user.account_profile.email}, format="json"
    )
    token = raw_token()
    assert (
        result.data
        == api.post(
            "/api/v1/auth/password-reset/request/", {"email": "missing@example.test"}, format="json"
        ).data
    )
    assert (
        api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": token, "password": "New-fictional-password!821923"},
            format="json",
        ).status_code
        == 200
    )
    assert other.get("/api/v1/auth/me/").status_code == 403
    assert (
        api.post(
            "/api/v1/auth/password-reset/confirm/",
            {"token": token, "password": PASSWORD},
            format="json",
        ).status_code
        == 400
    )


def test_send_failure_keeps_account_unverified_and_existing_link_usable(enabled):
    user = account("mail-failure", verified=False)
    issue_link(user, "verify")
    old = raw_token()
    with patch("accounts.services.send_mail", side_effect=RuntimeError("private provider detail")):
        result = api_for(user).post("/api/v1/auth/resend-verification/", {}, format="json")
    assert result.status_code == 503
    assert b"private provider detail" not in result.content
    assert AccountToken.objects.filter(consumed_at=None).count() == 1
    consume_link(old, "verify", actor=user)


def test_persistent_limits_and_duplicate_identifiers(enabled):
    limit("test", "identity", 1, 900)
    with pytest.raises(Exception, match="Too many attempts"):
        limit("test", "IDENTITY", 1, 900)
    user = account("unique")
    api = APIClient()
    for username, email in [
        ("UNIQUE", "new@example.test"),
        ("new", user.account_profile.email.upper()),
    ]:
        result = api.post(
            "/api/v1/auth/register/",
            {
                "username": username,
                "email": email,
                "password": PASSWORD,
                "password_confirmation": PASSWORD,
            },
            format="json",
        )
        assert result.status_code == 400


@pytest.fixture
def pair(enabled):
    planner = account("choir-owner", planner=True)
    member = account("choir-member")
    outsider = account("outsider")
    a = create_choir(planner, {"name": "A choir", "is_public": True})
    b = create_choir(planner, {"name": "B choir", "is_public": False, "show_member_count": False})
    Membership.objects.create(choir=a, user=member)
    return planner, member, outsider, a, b


def test_discovery_and_roster_privacy(pair):
    planner, member, outsider, a, b = pair
    api = api_for(outsider)
    directory = api.get("/api/v1/choirs/directory/").data["results"]
    assert [r["id"] for r in directory] == [a.pk]
    assert directory[0]["role"] is None and directory[0]["member_count"] == 2
    assert api.get(f"/api/v1/choirs/{a.pk}/").status_code == 404
    result = api.post(
        "/api/v1/choirs/lookup-code/", {"code": b.codes.get(is_active=True).code}, format="json"
    )
    assert result.status_code == 200 and result.data["member_count"] is None
    assert not {"members", "requests", "code", "email"} & result.data.keys()
    detail = api_for(member).get(f"/api/v1/choirs/{a.pk}/").data
    assert "code" not in detail and "requests" not in detail
    assert all("email" not in m for m in detail["members"])


def test_private_code_needs_approval_regeneration_retires_old_and_preserves_requests(pair):
    planner, _, outsider, a, b = pair
    old = b.codes.get(is_active=True).code
    request = request_join(outsider, b.pk, old)
    assert not Membership.objects.filter(choir=b, user=outsider).exists()
    request_join(outsider, b.pk, old)
    assert JoinRequest.objects.filter(choir=b, user=outsider).count() == 1
    api = api_for(planner)
    assert (
        api.post(
            f"/api/v1/choirs/{b.pk}/regenerate-code/", {"confirm": False}, format="json"
        ).status_code
        == 400
    )
    new = regenerate(planner, b.pk).code
    assert len(new) == 8 and new != old
    assert (
        api_for(outsider)
        .post("/api/v1/choirs/lookup-code/", {"code": old}, format="json")
        .status_code
        == 404
    )
    decide(planner, b.pk, request.pk, "approved")
    assert Membership.objects.filter(choir=b, user=outsider).exists()


def test_membership_management_and_creation_permission_are_separate(pair):
    planner, member, _, a, b = pair
    owner = Membership.objects.get(choir=a, user=planner)
    with pytest.raises(Exception, match="last planner"):
        change_member(planner, a.pk, owner.pk)
    regular = Membership.objects.get(choir=a, user=member)
    change_member(planner, a.pk, regular.pk, "Planner")
    change_member(planner, a.pk, owner.pk)
    with pytest.raises(Exception, match="administrator"):
        create_choir(member, {"name": "Not allowed"})
    # Choir A planner has no write authority in B.
    assert (
        api_for(member, b)
        .post("/api/v1/masses/", {"date": "2026-10-20"}, format="json")
        .status_code
        == 404
    )
    language = Language.objects.create(name="Forged context language", slug="forged-context")
    placement = MassPlacement.objects.create(name="Forged context placement", slug="forged-context")
    payload = {
        "title": "Must not persist",
        "language_id": language.pk,
        "placement_ids": [placement.pk],
        "is_season_neutral": True,
    }
    before = Hymn.objects.count()
    assert api_for(member, b).post("/api/v1/hymns/", payload, format="json").status_code == 404
    assert Hymn.objects.count() == before


def test_code_collision_retries_without_reusing_retired_codes(pair):
    planner, _, _, a, b = pair
    old = a.codes.get(is_active=True).code
    sequence = iter(old + "ZZZZZZZZ")
    with patch("choirs.services.secrets.choice", side_effect=lambda _: next(sequence)):
        new = regenerate(planner, a.pk)
    assert new.code == "ZZZZZZZZ"
    assert JoinCode.objects.filter(code=old, is_active=False).exists()


def test_counts_dates_filters_history_and_direct_ids_are_isolated(pair):
    planner, member, outsider, a, b = pair
    language = Language.objects.create(name="Choir language", slug="choir-language")
    placement = MassPlacement.objects.create(name="Choir placement", slug="choir-placement")
    hymn = Hymn.objects.create(title="Shared hymn", language=language)
    hymn.placements.add(placement)
    ma = Mass.objects.create(choir=a, date="2026-10-20", title="A secret", status="finalized")
    mb = Mass.objects.create(choir=b, date="2027-01-01", title="B secret", status="finalized")
    for mass, total in ((ma, 2), (mb, 1)):
        for position in range(total):
            MassHymnSelection.objects.create(
                mass=mass, hymn=hymn, placement=placement, position=position
            )
    aa, bb = api_for(planner, a), api_for(planner, b)
    ha = aa.get(f"/api/v1/hymns/{hymn.pk}/").data
    hb = bb.get(f"/api/v1/hymns/{hymn.pk}/").data
    assert (ha["usage_count"], ha["last_used_date"]) == (2, "2026-10-20")
    assert (hb["usage_count"], hb["last_used_date"]) == (1, "2027-01-01")
    assert aa.get(f"/api/v1/hymns/{hymn.pk}/usage/").data["count"] == 2
    assert bb.get(f"/api/v1/hymns/{hymn.pk}/usage/").data["count"] == 1
    assert aa.get("/api/v1/hymns/?used_after=2026-12-01").data["count"] == 0
    assert bb.get("/api/v1/hymns/?used_after=2026-12-01").data["count"] == 1
    assert api_for(member, a).get(f"/api/v1/masses/{mb.pk}/").status_code == 404
    assert api_for(outsider, a).get("/api/v1/masses/").status_code == 404
    assert api_for(outsider).get("/api/v1/hymns/?ordering=most_used").status_code == 400
    assert api_for(outsider).get(f"/api/v1/hymns/{hymn.pk}/").data["usage_count"] == 0
    transition_mass(ma.pk, planner, "1", reopen=True)
    assert aa.get(f"/api/v1/hymns/{hymn.pk}/").data["usage_count"] == 0
    assert bb.get(f"/api/v1/hymns/{hymn.pk}/").data["usage_count"] == 1
    assert (
        api_for(member, a)
        .patch(
            f"/api/v1/masses/{mb.pk}/",
            {"title": "intrusion"},
            format="json",
            HTTP_X_EXPECTED_MASS_REVISION="1",
        )
        .status_code
        == 404
    )


def test_owner_activation_gate_and_existing_session_are_enforced(enabled, settings):
    settings.ACCOUNT_REGISTRATION_ENABLED = False
    before = get_user_model().objects.count()
    response = APIClient().post(
        "/api/v1/auth/register/",
        {
            "username": "closed",
            "email": "closed@example.test",
            "password": PASSWORD,
            "password_confirmation": PASSWORD,
        },
        format="json",
    )
    assert response.status_code == 503 and get_user_model().objects.count() == before
    user = get_user_model().objects.create_user(username="legacy-session", password=PASSWORD)
    api = APIClient()
    assert api.login(username=user.username, password=PASSWORD)
    assert api.get("/api/v1/auth/me/").data["verification_required"]
    assert api.get("/api/v1/hymns/").status_code == 403
    assert api.get("/api/v1/choirs/").status_code == 403


def test_password_change_and_unverified_email_correction(enabled):
    user = account("password-change")
    first, second = APIClient(), APIClient()
    assert first.login(username=user.username, password=PASSWORD)
    assert second.login(username=user.username, password=PASSWORD)
    assert (
        first.post(
            "/api/v1/auth/password/",
            {"current_password": "wrong", "password": PASSWORD},
            format="json",
        ).status_code
        == 400
    )
    result = first.post(
        "/api/v1/auth/password/",
        {"current_password": PASSWORD, "password": "Different-fictional-secret!762954"},
        format="json",
    )
    assert result.status_code == 200 and second.get("/api/v1/auth/me/").status_code == 403
    pending = account("correct-email", verified=False)
    issue_link(pending, "verify")
    old = raw_token()
    set_email(pending, "Corrected@Example.Test")
    assert AccountProfile.objects.get(user=pending).email == "corrected@example.test"
    with pytest.raises(Exception, match="invalid or expired"):
        consume_link(old, "verify", actor=pending)
    with pytest.raises(Exception, match="cannot be used"):
        set_email(pending, user.account_profile.email.upper())


def test_choir_creation_grants_are_admin_only_and_do_not_grant_membership(pair):
    planner, member, _, a, b = pair
    payload = {"username": member.username, "can_create_choirs": True}
    assert (
        api_for(planner).post("/api/v1/auth/choir-creation/", payload, format="json").status_code
        == 403
    )
    admin = account("grant-admin")
    admin.is_superuser = True
    admin.save()
    assert (
        api_for(admin).post("/api/v1/auth/choir-creation/", payload, format="json").status_code
        == 200
    )
    assert AccountProfile.objects.get(user=member).can_create_choirs
    assert not Membership.objects.filter(choir=b, user=member).exists()
    assert (
        create_choir(member, {"name": "New permitted choir"}).memberships.get(user=member).role
        == "Planner"
    )


def test_request_cancel_decline_reapply_and_removal_revoke_access(pair):
    planner, member, outsider, a, b = pair
    item = request_join(outsider, a.pk)
    api = api_for(outsider)
    assert (
        api.post(f"/api/v1/choirs/requests/{item.pk}/cancel/", {}, format="json").status_code == 204
    )
    item.refresh_from_db()
    assert item.status == "cancelled"
    request_join(outsider, a.pk)
    decide(planner, a.pk, item.pk, "declined")
    assert not Membership.objects.filter(choir=a, user=outsider).exists()
    request_join(outsider, a.pk)
    decide(planner, a.pk, item.pk, "approved")
    membership = Membership.objects.get(choir=a, user=outsider)
    assert api.get(f"/api/v1/choirs/{a.pk}/").status_code == 200
    change_member(planner, a.pk, membership.pk)
    assert api.get(f"/api/v1/choirs/{a.pk}/").status_code == 404


def test_login_limits_persist_between_clients(enabled, settings):
    settings.ACCOUNT_LOGIN_LIMIT = 1
    user = account("rate-login")
    payload = {"username": user.username, "password": "incorrect"}
    assert APIClient().post("/api/v1/auth/login/", payload, format="json").status_code == 400
    assert APIClient().post("/api/v1/auth/login/", payload, format="json").status_code == 429


def test_verification_also_gates_existing_admin_sessions(enabled):
    user = account("pending-admin", verified=False)
    user.is_staff = True
    user.is_superuser = True
    user.save()
    client = Client()
    client.force_login(user, backend="accounts.backends.EmailOrUsernameBackend")
    assert client.get("/admin/masses/mass/").status_code == 302
    assert client.get("/admin/login/")["Location"] == "https://example.test/verify-email"


def test_failed_resends_cannot_bypass_limits_or_revoke_existing_link(enabled, caplog):
    user = account("bounded-mail", verified=False)
    issue_link(user, "verify")
    old = raw_token()
    with patch(
        "accounts.services.send_mail", side_effect=RuntimeError("private-provider-payload")
    ) as send:
        api = api_for(user)
        results = [
            api.post("/api/v1/auth/resend-verification/", {}, format="json") for _ in range(4)
        ]
    assert [result.status_code for result in results] == [503, 503, 429, 429]
    assert send.call_count == 2
    assert "private-provider-payload" not in caplog.text
    assert all(old.encode() not in result.content for result in results)
    assert AccountToken.objects.filter(consumed_at=None).count() == 1
    consume_link(old, "verify", actor=user)


def test_disabled_account_and_malformed_tokens_never_verify(enabled):
    user = account("disabled-link", verified=False)
    issue_link(user, "verify")
    token = raw_token()
    user.is_active = False
    user.save(update_fields=["is_active"])
    with pytest.raises(Exception, match="no longer valid"):
        consume_link(token, "verify", actor=user)
    for invalid in ("", "not-a-token", "x" * 512):
        with pytest.raises(Exception, match="invalid or expired"):
            consume_link(invalid, "verify", actor=user)
    user.account_profile.refresh_from_db()
    assert user.account_profile.verified_at is None


def test_unsafe_origin_does_not_send_or_create_a_link(enabled, settings):
    user = account("bad-origin", verified=False)
    settings.APP_PUBLIC_URL = "https://example.test/#private-fragment"
    with patch("accounts.services.send_mail") as send:
        with pytest.raises(Exception, match="Email delivery"):
            issue_link(user, "verify")
    send.assert_not_called()
    assert not AccountToken.objects.exists()
