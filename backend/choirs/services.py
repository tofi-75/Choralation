"""Lock choir before membership/request changes, including last-planner checks."""

import secrets

from django.db import IntegrityError, transaction
from rest_framework.exceptions import PermissionDenied, ValidationError

from accounts.permissions import verified_access
from accounts.services import profile_for
from choirs.access import is_admin, require_choir
from choirs.models import Choir, JoinCode, JoinRequest, Membership

ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def new_code(choir):
    for _ in range(20):
        try:
            with transaction.atomic():
                return JoinCode.objects.create(
                    choir=choir, code="".join(secrets.choice(ALPHABET) for _ in range(8))
                )
        except IntegrityError:
            continue
    raise ValidationError("Unable to generate a code. Please try again.")


@transaction.atomic
def create_choir(user, data):
    if not verified_access(user) or not (is_admin(user) or profile_for(user).can_create_choirs):
        raise PermissionDenied("An app administrator must grant permission to create choirs.")
    choir = Choir.objects.create(**data)
    Membership.objects.create(choir=choir, user=user, role="Planner")
    new_code(choir)
    return choir


@transaction.atomic
def regenerate(user, pk):
    choir = require_choir(user, pk, planner=True, lock=True)
    choir.codes.filter(is_active=True).update(is_active=False)
    return new_code(choir)


@transaction.atomic
def request_join(user, pk, code=None):
    if not verified_access(user):
        raise PermissionDenied("Verify your email first.")
    choir = Choir.objects.select_for_update().filter(pk=pk).first()
    if choir is None or (
        not choir.is_public
        and not JoinCode.objects.filter(choir=choir, code=code, is_active=True).exists()
    ):
        raise ValidationError("This choir is not available. Ask a planner for its current code.")
    if Membership.objects.filter(choir=choir, user=user).exists():
        raise ValidationError("You already belong to this choir.")
    item, _ = JoinRequest.objects.get_or_create(choir=choir, user=user)
    if item.status != "pending":
        item.status = "pending"
        item.save()
    return item


@transaction.atomic
def decide(user, choir_id, request_id, decision):
    choir = require_choir(user, choir_id, planner=True, lock=True)
    item = JoinRequest.objects.select_for_update().filter(choir=choir, pk=request_id).first()
    if item is None or item.status != "pending":
        raise ValidationError("This request is no longer pending.")
    if decision == "approved":
        Membership.objects.get_or_create(choir=choir, user=item.user)
    item.status = decision
    item.save()


@transaction.atomic
def change_member(user, choir_id, member_id, role=None):
    choir = require_choir(user, choir_id, lock=True)
    item = Membership.objects.filter(choir=choir, pk=member_id).first()
    if item is None:
        raise ValidationError("Membership not found.")
    if role is not None or item.user_id != user.pk:
        require_choir(user, choir_id, planner=True)
    if (
        item.role == "Planner"
        and role != "Planner"
        and not Membership.objects.filter(choir=choir, role="Planner").exclude(pk=item.pk).exists()
    ):
        raise ValidationError("Appoint another planner before removing the last planner.")
    if role is None:
        item.delete()
    else:
        item.role = role
        item.save(update_fields=["role"])
