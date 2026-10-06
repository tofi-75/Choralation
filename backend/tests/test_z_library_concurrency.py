"""Actual PostgreSQL row-lock race: deactivation cannot admit a new inactive link.

Transactional fixtures flush migration seed groups, so the actor is a superuser
and does not depend on those groups. Uses separate connections/events and observes
PostgreSQL waiting rather than assuming a fixed sleep makes mutations overlap.
"""

import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from django.db import close_old_connections, connection, transaction
from rest_framework.exceptions import ValidationError

from hymns.models import Genre, Hymn, Language, MassPlacement
from hymns.services import save_hymn


@pytest.mark.django_db(transaction=True)
def test_concurrent_deactivation_rejects_new_link(django_user_model):
    actor = django_user_model.objects.create_superuser(
        username="race-admin", password="Fixture-secret-only!567"
    )
    genre = Genre.objects.create(name="Race genre", slug="race")
    language = Language.objects.create(name="Race language", slug="race")
    placement = MassPlacement.objects.create(name="Race placement", slug="race")
    started = Event()

    def add_link():
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET application_name = 'm2-link-race'")
                cursor.execute("SET lock_timeout = '5s'")
            started.set()
            try:
                save_hymn(
                    {
                        "title": "Race hymn",
                        "language_id": language.pk,
                        "genre_ids": [genre.pk],
                        "placement_ids": [placement.pk],
                        "is_season_neutral": True,
                    },
                    django_user_model.objects.get(pk=actor.pk),
                )
                return "saved"
            except ValidationError:
                return "rejected"
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=1) as executor:
        with transaction.atomic():
            locked = Genre.objects.select_for_update().get(pk=genre.pk)
            locked.is_active = False
            locked.save()
            future = executor.submit(add_link)
            assert started.wait(3)
            observed_wait = False
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                with connection.cursor() as cursor:
                    cursor.execute(
                        "SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='m2-link-race' AND wait_event_type='Lock')"
                    )
                    observed_wait = cursor.fetchone()[0]
                if observed_wait:
                    break
                time.sleep(0.02)
        assert future.result(timeout=5) == "rejected"
        assert observed_wait, "The competing write never waited on the category lock."
    assert not Hymn.objects.exists()
