"""Incoming requests are scoped by management permissions, not the selected choir."""

import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from choirs.models import Choir, JoinRequest, Membership

pytestmark = pytest.mark.django_db


def test_inbox_admin_sees_all_planner_only_owned_choirs_and_members_none(settings):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    User = get_user_model()
    admin = User.objects.create_user(username="inbox-admin", is_superuser=True)
    planner = User.objects.create_user(username="inbox-planner")
    member = User.objects.create_user(username="inbox-member")
    applicant = User.objects.create_user(username="inbox-applicant", email="private@example.test")
    a = Choir.objects.create(name="Private A")
    b = Choir.objects.create(name="Private B")
    Membership.objects.create(choir=a, user=planner, role="Planner")
    Membership.objects.create(choir=b, user=planner, role="Member")
    Membership.objects.create(choir=a, user=member)
    first = JoinRequest.objects.create(choir=a, user=applicant)
    second = JoinRequest.objects.create(choir=b, user=applicant)
    JoinRequest.objects.create(choir=b, user=member, status="declined")
    api = APIClient()
    assert api.get("/api/v1/choirs/pending-requests/").status_code == 403
    for actor, ids in [
        (admin, {first.id, second.id}),
        (planner, {first.id}),
        (member, set()),
        (applicant, set()),
    ]:
        api.force_authenticate(actor)
        response = api.get("/api/v1/choirs/pending-requests/", HTTP_X_CHOIR_ID=str(b.id))
        assert response.status_code == 200
        assert {row["id"] for row in response.data["results"]} == ids
        assert response.data["count"] == len(ids)
        assert "private@example.test" not in str(response.data)
    api.force_authenticate(planner)
    denied = api.post(
        f"/api/v1/choirs/{b.id}/requests/{second.id}/decide/", {"status": "approved"}, format="json"
    )
    assert denied.status_code == 403
    api.force_authenticate(admin)
    assert (
        api.post(
            f"/api/v1/choirs/{b.id}/requests/{second.id}/decide/",
            {"status": "approved"},
            format="json",
        ).status_code
        == 204
    )
    assert api.get("/api/v1/choirs/pending-requests/").data["count"] == 1
    assert Membership.objects.filter(choir=b, user=applicant).exists()
    Membership.objects.filter(choir=a, user=planner).update(role="Member")
    api.force_authenticate(planner)
    assert api.get("/api/v1/choirs/pending-requests/").data["count"] == 0
