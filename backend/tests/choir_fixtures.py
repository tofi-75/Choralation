"""Explicit single-choir ownership for pre-choir regression scenarios."""

from rest_framework.test import APIClient

from choirs.models import Choir, Membership


def legacy_choir():
    return Choir.objects.get_or_create(name="Initial choir")[0]


def choir_member(user):
    roles = set(user.groups.values_list("name", flat=True))
    return Membership.objects.update_or_create(
        user=user,
        choir=legacy_choir(),
        defaults={"role": "Planner" if roles & {"Admin", "Planner"} else "Member"},
    )[0]


def choir_client(**kwargs):
    return APIClient(HTTP_X_CHOIR_ID=str(legacy_choir().pk), **kwargs)
