"""Two PostgreSQL connections demonstrate one revision admits only one writer."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections, connection

from masses.models import Mass
from masses.services import RevisionConflict, save_mass


@pytest.mark.django_db(transaction=True)
def test_two_writers_share_one_mass_revision(django_user_model):
    actor = django_user_model.objects.create_superuser(username="mass-race")
    mass = Mass.objects.create(date="2026-10-07", title="Original")
    barrier = Barrier(2)

    def edit(title):
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '5s'")
            user = django_user_model.objects.get(pk=actor.pk)
            barrier.wait(timeout=3)
            try:
                save_mass({"title": title}, user, mass.pk, "1")
                return "saved"
            except RevisionConflict:
                return "conflict"
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(edit, ("First writer", "Second writer")))
    assert sorted(results) == ["conflict", "saved"]
    mass.refresh_from_db()
    assert mass.revision == 2 and mass.title in {"First writer", "Second writer"}
