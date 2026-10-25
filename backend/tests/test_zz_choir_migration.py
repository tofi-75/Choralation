"""Exercise the actual legacy-to-choir data migration on the disposable test DB."""

import pytest
from django.db import connection
from django.db.migrations.executor import MigrationExecutor


@pytest.mark.django_db(transaction=True)
def test_legacy_migration_preserves_identity_passwords_masses_and_selections():
    executor = MigrationExecutor(connection)
    latest = executor.loader.graph.leaf_nodes()
    executor.migrate([("masses", "0001_initial")])
    state = executor.loader.project_state(
        [("masses", "0001_initial"), ("accounts", "0002_initial"), ("choirs", "0001_initial")]
    ).apps
    User = state.get_model("auth", "User")
    Group = state.get_model("auth", "Group")
    Mass = state.get_model("masses", "Mass")
    Hymn = state.get_model("hymns", "Hymn")
    Language = state.get_model("hymns", "Language")
    Placement = state.get_model("hymns", "MassPlacement")
    Selection = state.get_model("masses", "MassHymnSelection")
    user = User.objects.create(
        username="legacy-migration-owner",
        email="Legacy@Example.Test",
        password="preserved-password-hash",
    )
    group, _ = Group.objects.get_or_create(name="Planner")
    user.groups.add(group)
    language = Language.objects.create(name="Legacy language", slug="legacy-language")
    placement = Placement.objects.create(name="Legacy placement", slug="legacy-placement")
    hymn = Hymn.objects.create(
        title="Legacy hymn", language=language, sheet_music_pdf="existing/private.pdf"
    )
    mass = Mass.objects.create(
        title="Legacy program", date="2026-10-20", status="finalized", created_by=user, revision=7
    )
    selection = Selection.objects.create(
        mass=mass, hymn=hymn, placement=placement, position=0, notes="Retain me"
    )
    try:
        executor = MigrationExecutor(connection)
        executor.migrate(latest)
        apps = executor.loader.project_state(latest).apps
        saved_user = apps.get_model("auth", "User").objects.get(pk=user.pk)
        saved_mass = apps.get_model("masses", "Mass").objects.get(pk=mass.pk)
        profile = apps.get_model("accounts", "AccountProfile").objects.get(user_id=user.pk)
        assert (
            saved_user.password == "preserved-password-hash"
            and saved_user.username == user.username
        )
        assert saved_mass.revision == 7 and saved_mass.status == "finalized"
        assert saved_mass.choir.name == "Initial choir" and not saved_mass.choir.is_public
        assert (
            apps.get_model("choirs", "Membership")
            .objects.get(choir_id=saved_mass.choir_id, user_id=user.pk)
            .role
            == "Planner"
        )
        assert (
            profile.email == "legacy@example.test"
            and profile.verified_at is None
            and profile.can_create_choirs
        )
        assert (
            apps.get_model("masses", "MassHymnSelection").objects.get(pk=selection.pk).notes
            == "Retain me"
        )
        assert (
            apps.get_model("hymns", "Hymn").objects.get(pk=hymn.pk).sheet_music_pdf
            == "existing/private.pdf"
        )
        # A pre-choir worker can still insert during the rolling deployment.
        with connection.cursor() as cursor:
            cursor.execute(
                "INSERT INTO masses_mass (date,title,status,revision,created_at,updated_at) VALUES ('2026-10-21','Legacy rolling insert','draft',1,NOW(),NOW()) RETURNING choir_id"
            )
            assert cursor.fetchone()[0] == saved_mass.choir_id
    finally:
        MigrationExecutor(connection).migrate(latest)
