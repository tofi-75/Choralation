"""Explicit choir context; object visibility never follows an app-wide Planner role."""

from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from accounts.permissions import Role, role_for, verified_access
from choirs.models import Choir, Membership


def is_admin(user):
    return user.is_authenticated and role_for(user) == Role.ADMIN


def visible_choirs(user):
    if not verified_access(user):
        return Choir.objects.none()
    return (
        Choir.objects.all()
        if is_admin(user)
        else Choir.objects.filter(pk__in=Membership.objects.filter(user=user).values("choir_id"))
    )


def require_choir(user, choir_id, *, planner=False, lock=False):
    if not verified_access(user):
        raise PermissionDenied("Verify your email before continuing.")
    query = visible_choirs(user)
    if lock:
        query = query.select_for_update()
    choir = query.filter(pk=choir_id).first()
    if choir is None:
        raise NotFound("Choir not found.")
    if (
        planner
        and not is_admin(user)
        and not Membership.objects.filter(choir=choir, user=user, role="Planner").exists()
    ):
        raise PermissionDenied("Only this choir's planners can make this change.")
    return choir


def request_choir(request, *, required=True, planner=False):
    value = request.headers.get("X-Choir-ID")
    if not value:
        if required:
            raise ValidationError({"choir": ["Choose a choir first."]})
        return None
    if not value.isascii() or not value.isdigit() or len(value) > 18 or int(value) < 1:
        raise ValidationError({"choir": ["Choose a valid choir."]})
    return require_choir(request.user, int(value), planner=planner).pk
