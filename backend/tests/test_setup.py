"""Check repeatable provisioning, strict configuration, and safe diagnostics."""

from io import StringIO

import pytest
from django.contrib.auth.models import Group
from django.core.exceptions import ImproperlyConfigured
from django.core.management import call_command
from django.core.management.base import CommandError
from django.db import DatabaseError

from config.environment import boolean, load_environment


@pytest.mark.django_db
def test_roles_can_be_provisioned_twice_without_losing_memberships(django_user_model):
    user = django_user_model.objects.create_user(username="membership")
    user.groups.add(Group.objects.get(name="Viewer"))
    for _ in range(2):
        call_command("provision_roles", stdout=StringIO())
    assert Group.objects.filter(name__in=["Admin", "Planner", "Viewer"]).count() == 3
    assert user.groups.get().name == "Viewer"


@pytest.mark.django_db
def test_create_user_hashes_password_and_rejects_overwrite(monkeypatch, django_user_model):
    monkeypatch.setenv("FIXTURE_USER_PASSWORD", "Fixture-Strong-Secret-735!")
    call_command(
        "create_app_user",
        "test-viewer",
        role="Viewer",
        password_env="FIXTURE_USER_PASSWORD",
        stdout=StringIO(),
    )
    user = django_user_model.objects.get(username="test-viewer")
    assert user.check_password("Fixture-Strong-Secret-735!")
    assert not user.is_staff and not user.is_superuser
    assert user.groups.get().name == "Viewer"
    with pytest.raises(CommandError, match="unused username"):
        call_command("create_app_user", "test-viewer", password_env="FIXTURE_USER_PASSWORD")


@pytest.mark.django_db
def test_create_user_rejects_missing_password(monkeypatch, django_user_model):
    monkeypatch.delenv("MISSING_PASSWORD", raising=False)
    with pytest.raises(CommandError):
        call_command("create_app_user", "test-viewer", password_env="MISSING_PASSWORD")
    assert not django_user_model.objects.filter(username="test-viewer").exists()


def test_environment_is_simple_and_process_values_win(tmp_path, monkeypatch):
    file = tmp_path / ".env"
    file.write_text('# comment\nAPP_TEST_VALUE="from file"\nAPP_TEST_OTHER=other\n')
    monkeypatch.setenv("APP_TEST_VALUE", "process")
    monkeypatch.delenv("APP_TEST_OTHER", raising=False)
    load_environment(file)
    assert __import__("os").environ["APP_TEST_VALUE"] == "process"
    assert __import__("os").environ["APP_TEST_OTHER"] == "other"


def test_invalid_environment_entries_fail_early(tmp_path):
    file = tmp_path / ".env"
    file.write_text('APP_TEST_BAD="unclosed\n')
    with pytest.raises(ImproperlyConfigured, match="Unclosed"):
        load_environment(file)


def test_false_string_does_not_enable_debug(monkeypatch):
    monkeypatch.setenv("APP_TEST_BOOL", "false")
    assert boolean("APP_TEST_BOOL") is False
    monkeypatch.setenv("APP_TEST_BOOL", "yes")
    with pytest.raises(ImproperlyConfigured):
        boolean("APP_TEST_BOOL")


@pytest.mark.django_db
def test_live_and_ready(client):
    assert client.get("/health/live/").json() == {"status": "ok"}
    assert client.get("/health/ready/").json() == {"status": "ok"}


def test_readiness_hides_database_exception(client, monkeypatch):
    def unavailable(*args, **kwargs):
        raise DatabaseError("Sensitive database details")

    monkeypatch.setattr("common.views.connection.cursor", unavailable)
    response = client.get("/health/ready/")
    assert response.status_code == 503
    assert response.json() == {"status": "unavailable"}
    assert b"Sensitive" not in response.content
