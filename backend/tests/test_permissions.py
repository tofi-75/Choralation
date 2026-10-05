"""Capability policy tests cover combinations rather than relying on hidden UI buttons."""

from types import SimpleNamespace

import pytest
from django.contrib.auth.models import AnonymousUser, Group

from accounts.permissions import AdminPermission, PlannerPermission, Role, role_for

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    ("groups", "staff", "superuser", "expected"),
    [
        ([], False, False, Role.VIEWER),
        (["Viewer"], False, False, Role.VIEWER),
        (["Planner"], False, False, Role.PLANNER),
        (["Admin"], False, False, Role.ADMIN),
        (["Viewer", "Planner", "Admin"], False, False, Role.ADMIN),
        ([], True, False, Role.VIEWER),
        ([], True, True, Role.ADMIN),
    ],
)
def test_highest_role_and_capabilities(django_user_model, groups, staff, superuser, expected):
    user = django_user_model.objects.create_user(
        username="policy-user", is_staff=staff, is_superuser=superuser
    )
    user.groups.set(Group.objects.filter(name__in=groups))
    request = SimpleNamespace(user=user)
    assert role_for(user) == expected
    assert PlannerPermission().has_permission(request, None) == (
        expected in {Role.PLANNER, Role.ADMIN}
    )
    assert AdminPermission().has_permission(request, None) == (expected == Role.ADMIN)


def test_anonymous_has_no_write_capability():
    request = SimpleNamespace(user=AnonymousUser())
    assert not PlannerPermission().has_permission(request, None)
    assert not AdminPermission().has_permission(request, None)
