"""Serialize Manager access requests and manual permission changes by applicant."""

from django.contrib.auth import get_user_model
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError

from accounts.models import AccountProfile, ManagerRequest
from accounts.permissions import Role, role_for, verified_access
from accounts.services import profile_for


class ManagerRequestConflict(APIException):
    status_code = 409
    default_code = "manager_request_conflict"
    default_detail = "This Manager request has already been reviewed."


def _lock_applicant(applicant):
    # Match account verification and email changes, which lock the profile before the user.
    profile = get_object_or_404(
        AccountProfile.objects.select_for_update(), pk=profile_for(applicant).pk
    )
    user = get_object_or_404(get_user_model().objects.select_for_update(), pk=applicant.pk)
    return user, profile


def _record_decision(item, reviewer, status):
    item.status = status
    item.reviewer = reviewer
    item.decided_at = timezone.now()
    item.save(update_fields=["status", "reviewer", "decided_at"])


def _grant(profile):
    if not profile.can_create_choirs:
        profile.can_create_choirs = True
        profile.save(update_fields=["can_create_choirs"])


@transaction.atomic
def submit_manager_request(actor):
    applicant, profile = _lock_applicant(actor)
    if not verified_access(applicant):
        raise PermissionDenied("This account is not eligible to request Manager access.")
    if role_for(applicant) == Role.ADMIN or profile.can_create_choirs:
        raise ManagerRequestConflict("You already have Manager access.")
    if applicant.manager_requests.filter(status=ManagerRequest.Status.PENDING).exists():
        raise ManagerRequestConflict("You already have a pending Manager request.")
    return applicant.manager_requests.create()


@transaction.atomic
def decide_manager_request(actor, request_id, status):
    request_ref = get_object_or_404(
        ManagerRequest.objects.select_related("applicant"), pk=request_id
    )
    applicant, profile = _lock_applicant(request_ref.applicant)
    item = get_object_or_404(applicant.manager_requests, pk=request_id)
    if item.status != ManagerRequest.Status.PENDING:
        raise ManagerRequestConflict()
    if status == ManagerRequest.Status.APPROVED:
        if not applicant.is_active:
            raise ValidationError("This account is inactive.")
        _grant(profile)
    _record_decision(item, actor, status)


@transaction.atomic
def set_choir_creation_permission(actor, username, allowed):
    applicant = get_user_model().objects.filter(username=username).first()
    if applicant is None:
        raise ValidationError({"username": ["Account not found."]})
    applicant, profile = _lock_applicant(applicant)
    if allowed:
        _grant(profile)
        item = applicant.manager_requests.filter(status=ManagerRequest.Status.PENDING).first()
        if item:
            _record_decision(item, actor, ManagerRequest.Status.APPROVED)
    elif profile.can_create_choirs:
        profile.can_create_choirs = False
        profile.save(update_fields=["can_create_choirs"])
