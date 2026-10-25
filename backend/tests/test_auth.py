"""Real session/CSRF tests against PostgreSQL, including anonymous unsafe requests."""

import pytest
from choir_fixtures import choir_member
from django.contrib.auth.models import Group
from django.test import Client

pytestmark = pytest.mark.django_db
PASSWORD = "Fixture-only-Strong-Password-762!"


@pytest.fixture
def user(django_user_model):
    account = django_user_model.objects.create_user(username="planner", password=PASSWORD)
    account.groups.add(Group.objects.get(name="Planner"))
    choir_member(account)
    return account


@pytest.fixture
def csrf_client():
    return Client(enforce_csrf_checks=True)


def token_for(client):
    response = client.get("/api/v1/auth/csrf/")
    assert response.status_code == 200
    assert response["Cache-Control"] == "no-store"
    assert response.cookies["csrftoken"]["httponly"]
    return response.json()["csrf_token"]


def sign_in(client, password=PASSWORD, token=None):
    return client.post(
        "/api/v1/auth/login/",
        {"username": "planner", "password": password},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token or token_for(client),
    )


def test_anonymous_data_and_schema_are_protected(csrf_client):
    for path in ("/api/v1/auth/me/", "/api/v1/schema/"):
        response = csrf_client.get(path)
        assert response.status_code == 403
        assert response.json()["code"] == "not_authenticated"


@pytest.mark.parametrize("supplied", [None, "invalid"])
def test_login_requires_csrf_even_when_anonymous(csrf_client, user, supplied):
    token_for(csrf_client)
    headers = {"HTTP_X_CSRFTOKEN": supplied} if supplied else {}
    response = csrf_client.post(
        "/api/v1/auth/login/",
        {"username": "planner", "password": PASSWORD},
        content_type="application/json",
        **headers,
    )
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_failed"
    assert csrf_client.get("/api/v1/auth/me/").status_code == 403


def test_invalid_credentials_do_not_create_a_session(csrf_client, user):
    response = sign_in(csrf_client, password="wrong-password")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_credentials"
    assert csrf_client.get("/api/v1/auth/me/").status_code == 403


def test_login_identity_persists_and_csrf_rotates(csrf_client, user):
    old_token = token_for(csrf_client)
    old_cookie = csrf_client.cookies["csrftoken"].value
    response = sign_in(csrf_client, token=old_token)
    assert response.status_code == 200
    assert {key: response.json()[key] for key in ("id", "username", "role")} == {
        "id": user.pk,
        "username": "planner",
        "role": "Planner",
    }
    assert response.json()["email_verified"] is False
    assert csrf_client.cookies["csrftoken"].value != old_cookie
    assert csrf_client.get("/api/v1/auth/me/").json() == response.json()
    assert "password" not in response.json()
    assert (
        csrf_client.post(
            "/api/v1/auth/logout/", {}, content_type="application/json", HTTP_X_CSRFTOKEN=old_token
        ).status_code
        == 403
    )


def test_logout_invalidates_session_and_repeat_is_safe(csrf_client, user):
    assert sign_in(csrf_client).status_code == 200
    token = token_for(csrf_client)
    for _ in range(2):
        response = csrf_client.post(
            "/api/v1/auth/logout/", {}, content_type="application/json", HTTP_X_CSRFTOKEN=token
        )
        assert response.status_code == 204
        assert not response.content
    assert csrf_client.get("/api/v1/auth/me/").json()["code"] == "not_authenticated"


def test_logout_without_csrf_never_clears_a_valid_session(csrf_client, user):
    sign_in(csrf_client)
    response = csrf_client.post("/api/v1/auth/logout/", {}, content_type="application/json")
    assert response.status_code == 403
    assert csrf_client.get("/api/v1/auth/me/").status_code == 200


def test_unknown_fields_and_missing_password_are_field_errors(csrf_client, user):
    response = csrf_client.post(
        "/api/v1/auth/login/",
        {"username": "planner", "role": "Admin"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token_for(csrf_client),
    )
    assert response.status_code == 400
    assert response.json()["code"] == "validation_error"
    assert "role" in response.json()["errors"]
    response = csrf_client.post(
        "/api/v1/auth/login/",
        {"username": "planner"},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token_for(csrf_client),
    )
    assert "password" in response.json()["errors"]


def test_inactive_account_cannot_log_in(csrf_client, user):
    user.is_active = False
    user.save(update_fields=["is_active"])
    assert sign_in(csrf_client).json()["code"] == "invalid_credentials"


def test_cross_origin_login_is_rejected(csrf_client, user):
    response = csrf_client.post(
        "/api/v1/auth/login/",
        {"username": "planner", "password": PASSWORD},
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token_for(csrf_client),
        HTTP_ORIGIN="https://untrusted.example",
    )
    assert response.status_code == 403
    assert response.json()["code"] == "csrf_failed"


def test_expired_session_requires_login_again(csrf_client, user):
    sign_in(csrf_client)
    session = csrf_client.session
    session.flush()
    assert csrf_client.get("/api/v1/auth/me/").json()["code"] == "not_authenticated"
