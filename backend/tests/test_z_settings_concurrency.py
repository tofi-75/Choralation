"""Concurrent settings writes reject stale versions instead of losing changes."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connections
from rest_framework.test import APIClient

from choirs.models import Choir
from hymns.models import Genre

pytestmark = pytest.mark.django_db(transaction=True)


def parallel(actor_id, path, bodies):
    barrier = Barrier(2)

    def attempt(body):
        close_old_connections()
        try:
            client = APIClient()
            client.force_authenticate(get_user_model().objects.get(pk=actor_id))
            barrier.wait(timeout=10)
            return client.patch(path, body, format="json").status_code
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        return sorted(pool.map(attempt, bodies))


def test_simultaneous_category_edits_preserve_one_version(settings):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    actor = get_user_model().objects.create_user(username="settings-race-admin", is_superuser=True)
    row = Genre.objects.create(name="Original race genre", slug="race-genre")
    version = row.updated_at.isoformat()
    assert parallel(
        actor.pk,
        f"/api/v1/genres/{row.pk}/",
        [
            {"name": "Race winner A", "expected_updated_at": version},
            {"name": "Race winner B", "expected_updated_at": version},
        ],
    ) == [200, 409]
    row.refresh_from_db()
    assert row.name in {"Race winner A", "Race winner B"}


def test_first_calendar_write_is_serialized_even_without_existing_config(settings):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    actor = get_user_model().objects.create_user(username="calendar-race-admin", is_superuser=True)
    choir = Choir.objects.create(name="Concurrent calendar choir")
    assert parallel(
        actor.pk,
        f"/api/v1/choirs/{choir.pk}/calendar/",
        [
            {"calendar": "manual", "time_zone": "Asia/Beirut", "version": 0},
            {"calendar": "maronite", "time_zone": "Pacific/Honolulu", "version": 0},
        ],
    ) == [200, 409]
    assert choir.calendar_settings.version == 1
