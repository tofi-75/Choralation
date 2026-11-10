from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from rest_framework.test import APIClient

from accounts.manager_requests import (
    ManagerRequestConflict,
    decide_manager_request,
    submit_manager_request,
)
from accounts.models import AccountProfile, ManagerRequest
from choirs.models import Choir, Membership

SELF = "/api/v1/auth/manager-requests/me/"
QUEUE = "/api/v1/auth/manager-requests/"
MANUAL = "/api/v1/auth/choir-creation/"


@pytest.fixture(autouse=True)
def simple_accounts(settings):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    settings.ACCOUNT_REGISTRATION_ENABLED = True


def client_for(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


def decision(client, pk, status):
    return client.post(f"{QUEUE}{pk}/decide/", {"status": status}, format="json")


@pytest.mark.django_db
def test_registered_user_requests_declines_reapplies_and_gains_scoped_access():
    member = APIClient()
    response = member.post(
        "/api/v1/auth/register/",
        {
            "username": "manager-applicant",
            "email": "manager-applicant@example.test",
            "password": "Blue-lantern!Account92",
            "password_confirmation": "Blue-lantern!Account92",
        },
        format="json",
    )
    assert response.status_code == 201
    assert response.json()["role"] == "Viewer"
    assert response.json()["can_create_choirs"] is False
    assert member.get(SELF).json() == {"request": None, "can_create_choirs": False}
    assert member.post("/api/v1/choirs/", {"name": "Denied"}, format="json").status_code == 403
    assert member.post(SELF, {"status": "approved"}, format="json").status_code == 400

    response = member.post(SELF, {}, format="json")
    assert response.status_code == 201
    first = response.json()["request"]["id"]
    assert member.post(SELF, {}, format="json").status_code == 409
    assert member.get(SELF).json()["request"]["id"] == first
    assert member.get(QUEUE).status_code == 403
    assert decision(member, first, "approved").status_code == 403

    owner = get_user_model().objects.create_superuser(username="reviewing-admin")
    admin = client_for(owner)
    assert admin.get(QUEUE).json()["results"][0]["username"] == "manager-applicant"
    assert decision(admin, first, "declined").status_code == 204
    assert decision(admin, first, "approved").status_code == 409
    assert member.get(SELF).json()["request"]["status"] == "declined"
    assert member.get("/api/v1/auth/me/").json()["can_create_choirs"] is False

    second = member.post(SELF, {}, format="json").json()["request"]["id"]
    assert second != first
    assert decision(admin, second, "approved").status_code == 204
    assert admin.get(QUEUE).json()["count"] == 0
    assert member.post(SELF, {}, format="json").status_code == 409
    reviewed = ManagerRequest.objects.get(pk=second)
    assert reviewed.reviewer == owner
    assert reviewed.decided_at is not None
    assert ManagerRequest.objects.get(pk=first).status == "declined"

    identity = member.get("/api/v1/auth/me/").json()
    assert identity["can_create_choirs"] is True
    assert identity["role"] == "Viewer"
    assert identity["can_edit_hymns"] is False
    created = member.post("/api/v1/choirs/", {"name": "Applicant choir"}, format="json")
    assert created.status_code == 201
    assert Membership.objects.filter(
        choir_id=created.json()["id"], user_id=identity["id"], role="Planner"
    ).exists()
    other = Choir.objects.create(name="Other private choir")
    assert member.get(f"/api/v1/choirs/{other.pk}/").status_code == 404


@pytest.mark.django_db
def test_manual_grant_closes_pending_request_and_revocation_keeps_membership():
    users = get_user_model().objects
    admin_user = users.create_superuser(username="manual-admin")
    applicant = users.create_user(username="manual-applicant")
    admin = client_for(admin_user)
    member = client_for(applicant)
    item = member.post(SELF, {}, format="json").json()["request"]
    data = {"username": applicant.username, "can_create_choirs": True}
    assert admin.post(MANUAL, data, format="json").status_code == 200
    assert admin.get(QUEUE).json()["count"] == 0
    assert decision(admin, item["id"], "declined").status_code == 409
    reviewed = ManagerRequest.objects.get(pk=item["id"])
    assert reviewed.status == "approved"
    assert reviewed.reviewer == admin_user
    choir = Choir.objects.create(name="Retained choir")
    membership = Membership.objects.create(choir=choir, user=applicant, role="Planner")
    assert (
        admin.post(MANUAL, {**data, "can_create_choirs": False}, format="json").status_code == 200
    )
    assert member.get(SELF).json()["can_create_choirs"] is False
    membership.refresh_from_db()
    assert membership.role == "Planner"
    assert member.post(SELF, {}, format="json").status_code == 201


@pytest.mark.django_db
def test_request_endpoints_require_signin_and_configured_verification(settings):
    assert APIClient().get(SELF).status_code == 403
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = True
    user = get_user_model().objects.create_user(username="unverified-manager")
    AccountProfile.objects.create(user=user, requires_verification=True)
    member = client_for(user)
    assert member.get(SELF).status_code == 403
    assert member.post(SELF, {}, format="json").status_code == 403


@pytest.mark.django_db
def test_pending_queue_is_paginated_and_oldest_first():
    users = get_user_model().objects
    admin = client_for(users.create_superuser(username="queue-admin"))
    applicants = users.bulk_create([get_user_model()(username=f"applicant-{i}") for i in range(21)])
    requests = ManagerRequest.objects.bulk_create(
        [ManagerRequest(applicant=user) for user in applicants]
    )
    first_page = admin.get(QUEUE).json()
    assert first_page["count"] == 21
    assert first_page["next"]
    assert [item["id"] for item in first_page["results"]] == [item.pk for item in requests[:20]]
    assert admin.get(QUEUE, {"page": 2}).json()["results"][0]["id"] == requests[-1].pk


@pytest.mark.django_db(transaction=True)
def test_concurrent_submissions_and_decisions_are_serialized():
    users = get_user_model().objects
    applicant = users.create_user(username="race-applicant")
    reviewers = [users.create_superuser(username=f"race-admin-{i}") for i in range(2)]

    def run_pair(action):
        barrier = Barrier(2)

        def run(index):
            close_old_connections()
            try:
                barrier.wait(timeout=5)
                action(index)
                return "success"
            except ManagerRequestConflict:
                return "conflict"
            finally:
                connection.close()

        with ThreadPoolExecutor(max_workers=2) as executor:
            return sorted(executor.map(run, range(2)))

    assert run_pair(lambda _: submit_manager_request(applicant)) == ["conflict", "success"]
    item = ManagerRequest.objects.get(applicant=applicant)
    assert run_pair(
        lambda index: decide_manager_request(reviewers[index], item.pk, "approved")
    ) == ["conflict", "success"]
    item.refresh_from_db()
    assert item.status == "approved"
    assert item.reviewer in reviewers
    assert AccountProfile.objects.get(user=applicant).can_create_choirs
