"""Global creation approval never substitutes for scoped choir permissions."""

from datetime import date

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from accounts.manager_requests import set_choir_creation_permission
from accounts.models import AccountProfile
from accounts.views import public_user
from choirs.models import Choir, Membership
from choirs.services import change_member, create_choir
from hymns.models import Language, MassPlacement
from hymns.services import save_hymn
from masses.models import Mass
from masses.services import delete_mass, save_mass, transition_mass

pytestmark = pytest.mark.django_db


@pytest.fixture
def roles(settings):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    users = {
        name: get_user_model().objects.create_user(username=name, is_superuser=name == "admin")
        for name in ["admin", "master", "leader", "planner", "member"]
    }
    AccountProfile.objects.create(user=users["master"], can_create_choirs=True)
    choir = Choir.objects.create(name="Scoped choir")
    for name, role in [
        ("master", "Member"),
        ("leader", "Leader"),
        ("planner", "Planner"),
        ("member", "Member"),
    ]:
        Membership.objects.create(choir=choir, user=users[name], role=role)
    return users, choir


def test_global_approval_and_choir_roles_are_independent(roles):
    users, choir = roles
    for name in ["master", "leader", "planner", "member"]:
        identity = public_user(users[name])
        assert identity["role"] == ("Choirmaster" if name == "master" else "User")
        assert identity["can_create_choirs"] == (name == "master")
        assert identity["can_edit_hymns"] == (name in ["leader", "planner"])
    for name in ["leader", "planner", "member"]:
        with pytest.raises(Exception, match="administrator"):
            create_choir(users[name], {"name": "Forbidden choir"})
    for name in ["master", "admin"]:
        own = create_choir(users[name], {"name": f"{name} choir"})
        assert own.memberships.get(user=users[name]).role == "Leader"
    assert choir.memberships.get(user=users["master"]).role == "Member"


def test_backfill_only_promotes_approved_existing_planners(roles):
    from importlib import import_module

    from django.apps import apps

    users, choir = roles
    Membership.objects.filter(choir=choir, user=users["master"]).update(role="Planner")
    migrate = import_module("choirs.migrations.0003_choir_leaders").assign_leaders
    for _ in range(2):
        migrate(apps, None)
    assert dict(choir.memberships.values_list("user__username", "role")) == {
        "master": "Leader",
        "leader": "Leader",
        "planner": "Planner",
        "member": "Member",
    }


def test_leader_manages_members_planner_only_plans_and_cannot_delete(roles):
    users, choir = roles
    member = choir.memberships.get(user=users["member"])
    with pytest.raises(Exception, match="leaders"):
        change_member(users["planner"], choir.pk, member.pk, "Planner")
    change_member(users["leader"], choir.pk, member.pk, "Leader")
    # Both leaders can be regular global Users. Demotion is blocked only for the last one.
    change_member(users["leader"], choir.pk, member.pk, "Planner")
    leader = choir.memberships.get(user=users["leader"])
    with pytest.raises(Exception, match="last leader"):
        change_member(users["leader"], choir.pk, leader.pk)
    for name in ["leader", "planner"]:
        mass = save_mass(
            {"choir_id": choir.pk, "date": date(2026, 11, 21), "title": name}, users[name]
        )
        mass = transition_mass(mass.pk, users[name], str(mass.revision))
        if name == "planner":
            with pytest.raises(Exception, match="leaders"):
                delete_mass(mass.pk, users[name], str(mass.revision))
        delete_mass(mass.pk, users["leader"], str(mass.revision))
    assert not Mass.objects.exists()


def test_cross_choir_deletion_and_management_are_denied(roles):
    users, choir = roles
    other = Choir.objects.create(name="Other choir")
    Membership.objects.create(choir=other, user=users["leader"], role="Member")
    mass = Mass.objects.create(choir=other, date="2026-11-21", title="Other")
    api = APIClient(HTTP_X_CHOIR_ID=str(other.pk))
    api.force_authenticate(users["leader"])
    assert (
        api.delete(f"/api/v1/masses/{mass.pk}/", HTTP_X_EXPECTED_MASS_REVISION="1").status_code
        == 403
    )
    assert (
        api.patch(f"/api/v1/choirs/{other.pk}/", {"name": "Intrusion"}, format="json").status_code
        == 403
    )
    assert Mass.objects.filter(pk=mass.pk).exists()


def test_revocation_preserves_leader_and_planner_memberships(roles):
    users, choir = roles
    own = create_choir(users["master"], {"name": "Retained choir"})
    set_choir_creation_permission(users["admin"], "master", False)
    assert public_user(users["master"])["role"] == "User"
    assert own.memberships.get(user=users["master"]).role == "Leader"
    assert choir.memberships.get(user=users["master"]).role == "Member"


def test_master_alone_creates_private_hymns_and_cannot_edit_shared(roles):
    users, _ = roles
    language = Language.objects.create(name="English", slug="english")
    placement = MassPlacement.objects.create(name="Entrance", slug="entrance")
    data = {
        "title": "Hymn",
        "language_id": language.pk,
        "placement_ids": [placement.pk],
        "is_season_neutral": True,
    }
    private = save_hymn(data, users["master"])
    assert private.publication_status == "private"
    shared = save_hymn(data, users["planner"])
    assert shared.publication_status == "published"
    with pytest.raises(Exception, match="cannot make"):
        save_hymn({"title": "No"}, users["master"], shared.pk)
