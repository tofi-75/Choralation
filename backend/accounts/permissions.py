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
    USER = "User"
    CHOIRMASTER = "Choirmaster"
    ADMIN = "Admin"


def role_for(user) -> Role:
    """Global approval is independent of every choir membership."""
    if user.is_authenticated and user.is_superuser:
        return Role.ADMIN
    names = set(user.groups.values_list("name", flat=True)) if user.is_authenticated else set()
    if Role.ADMIN in names:
        return Role.ADMIN
    from accounts.models import AccountProfile

    if (
        user.is_authenticated
        and AccountProfile.objects.filter(user=user, can_create_choirs=True).exists()
    ):
        return Role.CHOIRMASTER
    return Role.USER


def can_edit_shared_hymns(user):
    return verified_access(user) and (
        role_for(user) == Role.ADMIN
        or user.choir_memberships.filter(role__in=["Leader", "Planner"]).exists()
    )


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
    """Require a shared-hymn editor: scoped Leader/Planner or global Admin."""

    def has_permission(self, request, view):
        return bool(can_edit_shared_hymns(request.user))


class AdminPermission(BasePermission):
    """Require the application Admin role; staff status alone is insufficient."""

    def has_permission(self, request, view):
        return bool(verified_access(request.user) and role_for(request.user) == Role.ADMIN)
