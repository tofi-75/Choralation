"""Two PostgreSQL connections demonstrate one revision admits only one writer."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.db import close_old_connections, connection

from masses.models import Mass
from masses.services import RevisionConflict, save_mass, transition_mass


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


@pytest.mark.django_db(transaction=True)
@pytest.mark.parametrize("race", ["save_finalize", "finalize_reopen"])
def test_lifecycle_shares_save_lock_and_revision(django_user_model, race):
    actor = django_user_model.objects.create_superuser(username=f"lifecycle-{race}")
    mass = Mass.objects.create(date="2026-10-07", title="Original")
    barrier = Barrier(2)

    def write(kind):
        close_old_connections()
        try:
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '5s'")
            user = django_user_model.objects.get(pk=actor.pk)
            barrier.wait(timeout=3)
            try:
                if kind == "save":
                    save_mass({"title": "Changed"}, user, mass.pk, "1")
                else:
                    transition_mass(mass.pk, user, "1", reopen=kind == "reopen")
                return kind
            except RevisionConflict:
                return "conflict"
        finally:
            connection.close()

    operations = ["save", "finalize"] if race == "save_finalize" else ["finalize", "reopen"]
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(write, operations))
    mass.refresh_from_db()
    if race == "save_finalize":
        assert results.count("conflict") == 1 and mass.revision == 2
        assert (mass.status, mass.title) in {("draft", "Changed"), ("finalized", "Original")}
    else:
        # Reopen on the initial draft is an intentional no-op; if it wins,
        # finalize can use the unchanged revision. Otherwise reopen is stale.
        assert "finalize" in results and results[1] in {"reopen", "conflict"}
        assert mass.status == "finalized" and mass.revision == 2
    assert (mass.finalized_at is not None) == (mass.status == "finalized")
