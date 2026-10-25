"""Backend-enforced role policy shared by current and future feature endpoints.

Recognized groups are independent of Django's is_staff flag. This single
policy provides capability checks for M2+ without exposing placeholder write
endpoints now. Author attribution is not a record-ownership access rule.
"""

from enum import StrEnum

from django.conf import settings
from rest_framework.exceptions import PermissionDenied
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
    if user.is_authenticated and user.choir_memberships.filter(role="Planner").exists():
        return Role.PLANNER
    return Role.VIEWER


def verified_access(user):
    if not user.is_authenticated or not user.is_active:
        return False
    if not settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED:
        return True
    from accounts.models import AccountProfile

    profile = AccountProfile.objects.filter(user=user).first()
    required = settings.ACCOUNT_VERIFICATION_REQUIRED or (profile and profile.requires_verification)
    return bool(not required or (profile and profile.verified_at))


class VerifiedPermission(BasePermission):
    message = "Verify your email before accessing application data."

    def has_permission(self, request, view):
        if request.user.is_authenticated and not verified_access(request.user):
            error = PermissionDenied(self.message)
            error.default_code = "verification_required"
            raise error
        return verified_access(request.user)


class PlannerPermission(BasePermission):
    """Require an authenticated Planner/Admin, including for direct HTTP writes."""

    def has_permission(self, request, view):
        return bool(
            verified_access(request.user) and role_for(request.user) in {Role.PLANNER, Role.ADMIN}
        )


class AdminPermission(BasePermission):
    """Require the application Admin role; staff status alone is insufficient."""

    def has_permission(self, request, view):
        return bool(verified_access(request.user) and role_for(request.user) == Role.ADMIN)
