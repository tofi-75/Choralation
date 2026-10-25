"""Account policy and compatible default-section migration regressions."""

import importlib

import pytest
from django.apps import apps
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django.test import Client

from accounts.models import AccountProfile, RateBucket
from accounts.passwords import CompositionValidator
from hymns.models import Hymn, Language, MassPlacement

pytestmark = pytest.mark.django_db


def post(client, payload, csrf=True):
    token = client.get("/api/v1/auth/csrf/").json()["csrf_token"] if csrf else ""
    return client.post(
        "/api/v1/auth/username-availability/",
        payload,
        content_type="application/json",
        HTTP_X_CSRFTOKEN=token,
    )


def test_username_availability_is_normalized_unique_and_csrf_protected():
    user = get_user_model().objects.create_user(username="ChoirOwner")
    AccountProfile.objects.create(user=user, username_key="choirowner")
    client = Client(enforce_csrf_checks=True)
    assert post(client, {"username": "fresh-name"}, csrf=False).status_code == 403
    for name in ["CHOIROWNER", "  ChoirOwner  ", "bad@name", "bad name"]:
        response = post(client, {"username": name})
        assert response.status_code == 200
        assert response.json()["available"] is False
        assert "email" not in response.json()
    assert post(client, {"username": "Fresh-Name"}).json()["available"] is True
    assert post(client, {"username": "Ｆｒｅｓｈ-Ｎａｍｅ"}).json()["available"] is True


def test_username_check_has_durable_abuse_limits():
    client = Client()
    assert post(client, {"username": "available-name"}).status_code == 200
    RateBucket.objects.update(attempts=600)
    assert post(client, {"username": "another-name"}).status_code == 429


@pytest.mark.parametrize(
    "password", ["shortA1!", "abcdefgh1!", "Abcdefgh!", "Abcdefgh1", "Abcdefg1 "]
)
def test_new_passwords_require_all_components(password):
    if password == "shortA1!":
        password = password[:7]
    with pytest.raises(ValidationError, match="8 characters"):
        CompositionValidator().validate(password)


@pytest.mark.parametrize("password", ["Abcdef1!", "Abcdef1_", "Longer-password3!", "A1!مرحبا"])
def test_compliant_passwords_are_supported(password):
    CompositionValidator().validate(password)


def test_sections_preserve_ids_hymn_links_and_custom_rows():
    migration = importlib.import_module("hymns.migrations.0005_mass_sections")
    MassPlacement.objects.all().delete()
    old = MassPlacement.objects.create(name="Opening Hymn", slug="opening-hymn")
    retired = MassPlacement.objects.create(name="Anthem", slug="anthem")
    custom = MassPlacement.objects.create(
        name="Custom prayer", slug="custom-prayer", display_order=80
    )
    language = Language.objects.create(
        name="Migration test language", slug="migration-test-language"
    )
    hymn = Hymn.objects.create(
        title="Preserved", language=language, sheet_music_pdf="existing/score.pdf"
    )
    hymn.placements.add(old, retired)
    with connection.schema_editor() as editor:
        migration.update_sections(apps, editor)
        migration.update_sections(apps, editor)
    old.refresh_from_db()
    retired.refresh_from_db()
    custom.refresh_from_db()
    assert old.name == "Opening" and old.slug == "opening"
    assert retired.is_active is False and custom.is_active
    assert set(hymn.placements.values_list("id", flat=True)) == {old.id, retired.id}
    hymn.refresh_from_db()
    assert hymn.sheet_music_pdf.name == "existing/score.pdf"
    assert list(
        MassPlacement.objects.filter(is_active=True)
        .exclude(pk=custom.pk)
        .values_list("name", flat=True)
    ) == [item[1] for item in migration.SECTIONS]


def test_registration_rechecks_availability_and_rejects_weak_passwords(settings):
    settings.ACCOUNT_REGISTRATION_ENABLED = True
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    client = Client(enforce_csrf_checks=True)
    assert post(client, {"username": "NewUnique"}).json()["available"] is True
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf_token"]
    payload = {
        "username": "NewUnique",
        "email": "unique@example.test",
        "password": "weak",
        "password_confirmation": "weak",
    }
    response = client.post(
        "/api/v1/auth/register/", payload, content_type="application/json", HTTP_X_CSRFTOKEN=csrf
    )
    assert response.status_code == 400
    assert not get_user_model().objects.filter(username="NewUnique").exists()
    payload.update(
        password="A-fragrant-password19!", password_confirmation="A-fragrant-password19!"
    )
    assert (
        client.post(
            "/api/v1/auth/register/",
            payload,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        ).status_code
        == 201
    )
    assert post(client, {"username": "NEWUNIQUE"}).json()["available"] is False
    payload.update(username="NEWUNIQUE", email="different@example.test")
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf_token"]
    assert (
        client.post(
            "/api/v1/auth/register/",
            payload,
            content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf,
        ).status_code
        == 400
    )
    assert get_user_model().objects.filter(username__iexact="newunique").count() == 1
