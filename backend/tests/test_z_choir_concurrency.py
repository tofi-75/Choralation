from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from django.contrib.auth import get_user_model
from django.db import close_old_connections, connection
from rest_framework.exceptions import ValidationError

from choirs.models import Choir, JoinRequest, Membership
from choirs.services import change_member, decide


@pytest.mark.django_db(transaction=True)
def test_concurrent_approval_creates_one_membership():
    User = get_user_model()
    planner = User.objects.create_superuser(username="approve-admin")
    applicant = User.objects.create_user(username="approve-member")
    choir = Choir.objects.create(name="Approval race")
    request = JoinRequest.objects.create(choir=choir, user=applicant)
    barrier = Barrier(2)

    def approve(_):
        close_old_connections()
        try:
            actor = User.objects.get(pk=planner.pk)
            barrier.wait(timeout=5)
            try:
                decide(actor, choir.pk, request.pk, "approved")
                return "approved"
            except ValidationError:
                return "already handled"
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as workers:
        result = list(workers.map(approve, range(2)))
    assert sorted(result) == ["already handled", "approved"]
    assert Membership.objects.filter(choir=choir, user=applicant).count() == 1


@pytest.mark.django_db(transaction=True)
def test_concurrent_removals_cannot_remove_both_last_planners():
    User = get_user_model()
    admin = User.objects.create_superuser(username="remove-admin")
    choir = Choir.objects.create(name="Removal race")
    members = [
        Membership.objects.create(
            choir=choir, user=User.objects.create_user(username=f"last-{i}"), role="Planner"
        )
        for i in range(2)
    ]
    barrier = Barrier(2)

    def remove(member):
        close_old_connections()
        try:
            actor = User.objects.get(pk=admin.pk)
            barrier.wait(timeout=5)
            try:
                change_member(actor, choir.pk, member.pk)
                return "removed"
            except ValidationError:
                return "protected"
        finally:
            connection.close()

    with ThreadPoolExecutor(max_workers=2) as workers:
        result = list(workers.map(remove, members))
    assert sorted(result) == ["protected", "removed"]
    assert Membership.objects.filter(choir=choir, role="Planner").count() == 1
