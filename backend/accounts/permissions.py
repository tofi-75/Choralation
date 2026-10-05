"""Backend-enforced role policy shared by current and future feature endpoints.

Recognized groups are independent of Django's is_staff flag. This single
policy provides capability checks for M2+ without exposing placeholder write
endpoints now. Author attribution is not a record-ownership access rule.
"""

from enum import StrEnum

from rest_framework.permissions import BasePermission


class Role(StrEnum):
    VIEWER = "Viewer"
    PLANNER = "Planner"
    ADMIN = "Admin"


def role_for(user) -> Role:
    """Resolve highest recognized role; ungrouped users default to Viewer."""
    if user.is_authenticated and user.is_superuser:
        return Role.ADMIN
    names = set(user.groups.values_list("name", flat=True)) if user.is_authenticated else set()
    if Role.ADMIN in names:
        return Role.ADMIN
    if Role.PLANNER in names:
        return Role.PLANNER
    return Role.VIEWER


class PlannerPermission(BasePermission):
    """Require an authenticated Planner/Admin, including for direct HTTP writes."""

    def has_permission(self, request, view):
        return bool(
            request.user.is_authenticated and role_for(request.user) in {Role.PLANNER, Role.ADMIN}
        )


class AdminPermission(BasePermission):
    """Require the application Admin role; staff status alone is insufficient."""

    def has_permission(self, request, view):
        return bool(request.user.is_authenticated and role_for(request.user) == Role.ADMIN)
