"""Private hymn content and attachments cannot cross the publication boundary."""

import pytest
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from choirs.models import Choir, Membership
from hymns.models import Hymn, Language, MassPlacement
from hymns.services import ReferencedRecord, delete_category

pytestmark = pytest.mark.django_db


@pytest.fixture
def submissions(settings, tmp_path):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    settings.MEDIA_ROOT = tmp_path
    User = get_user_model()
    users = {
        name: User.objects.create_user(username=f"submission-{name}", is_superuser=name == "admin")
        for name in ["owner", "planner", "other", "member", "outsider", "admin"]
    }
    a = Choir.objects.create(name="Private review choir")
    b = Choir.objects.create(name="Other review choir")
    for name, choir, role in [
        ("owner", a, "Member"),
        ("member", a, "Member"),
        ("planner", a, "Planner"),
        ("other", b, "Planner"),
    ]:
        Membership.objects.create(user=users[name], choir=choir, role=role)
    language = Language.objects.create(name="Submission language", slug="submission-language")
    placement = MassPlacement.objects.create(
        name="Submission placement", slug="submission-placement"
    )
    api = APIClient()
    api.force_authenticate(users["owner"])
    payload = {
        "title": "Private proposed hymn",
        "language_id": language.pk,
        "placement_ids": [placement.pk],
        "is_season_neutral": True,
        "lyrics": "Private draft lyrics",
    }
    response = api.post("/api/v1/hymns/", payload, format="json")
    assert response.status_code == 201
    return api, users, a, b, placement, response.data


def submit(api, hymn, choir):
    response = api.post(
        f"/api/v1/hymns/{hymn['id']}/submit/",
        {"choir_id": choir.id, "expected_updated_at": hymn["updated_at"]},
        format="json",
    )
    assert response.status_code == 200
    return response.data


def test_member_creation_and_pdfs_are_private_until_explicit_approval(submissions):
    api, users, a, b, placement, hymn = submissions
    url = f"/api/v1/hymns/{hymn['id']}/"
    identity = api.get("/api/v1/auth/me/").data
    assert identity["can_add_hymns"] is True and identity["can_edit_hymns"] is False
    assert hymn["publication_status"] == "private"
    assert not Hymn.objects.filter(pk=hymn["id"]).exists()
    assert api.get("/api/v1/hymns/").data["count"] == 0
    assert api.get("/api/v1/hymns/mine/").data["count"] == 1
    import json

    response = api.patch(
        url,
        {
            "data": json.dumps({"notes": "Private notes"}),
            "sheet_music_pdf": SimpleUploadedFile(
                "private.pdf", b"%PDF-1.4\n%%EOF", content_type="application/pdf"
            ),
        },
        format="multipart",
    )
    assert response.status_code == 200
    hymn = response.data
    assert api.get(hymn["sheet_music_pdf"]["url"]).status_code == 200
    for name in ["member", "outsider", "other", "planner"]:
        api.force_authenticate(users[name])
        assert api.get(url).status_code == 404
        assert api.get(hymn["sheet_music_pdf"]["url"]).status_code == 404
        assert api.get("/api/v1/hymns/mine/").data["count"] == 0
    api.force_authenticate(users["owner"])
    hymn = submit(api, hymn, a)
    assert hymn["publication_status"] == "pending"
    for name in ["member", "outsider", "other"]:
        api.force_authenticate(users[name])
        assert api.get(url).status_code == 404
        assert api.get("/api/v1/hymns/review-queue/").data["count"] == 0
    api.force_authenticate(users["planner"])
    assert api.get(url).data["submission"]["can_review"] is True
    assert api.get(hymn["sheet_music_pdf"]["url"]).status_code == 200
    assert api.get("/api/v1/hymns/review-queue/").data["count"] == 1
    assert api.get("/api/v1/hymns/").data["count"] == 0
    denied = api.patch(url, {"title": "Unreviewed planner change"}, format="json")
    assert denied.status_code == 404
    assert (
        api.post(
            url + "review/",
            {
                "decision": "approve",
                "expected_updated_at": hymn["updated_at"],
                "note": "Private reviewer comment",
            },
            format="json",
        ).status_code
        == 200
    )
    for name in ["owner", "member", "outsider", "other"]:
        api.force_authenticate(users[name])
        published = api.get(url).data
        assert published["publication_status"] == "published" and published["submission"] is None
        assert api.get("/api/v1/hymns/").data["count"] == 1
        assert api.get(hymn["sheet_music_pdf"]["url"]).status_code == 200
    api.force_authenticate(users["owner"])
    assert api.patch(url, {"title": "Unauthorized shared edit"}, format="json").status_code == 403
    assert api.delete(url).status_code == 403


def test_submission_requires_ownership_membership_and_current_version(submissions):
    api, users, a, b, placement, hymn = submissions
    url = f"/api/v1/hymns/{hymn['id']}/"
    assert (
        api.post(
            url + "submit/",
            {"choir_id": b.id, "expected_updated_at": hymn["updated_at"]},
            format="json",
        ).status_code
        == 404
    )
    assert api.patch(url, {"publication_status": "published"}, format="json").status_code == 400
    pending = submit(api, hymn, a)
    edited = api.patch(url, {"title": "Revised private hymn"}, format="json")
    assert edited.status_code == 200 and edited.data["publication_status"] == "private"
    api.force_authenticate(users["planner"])
    assert api.get(url).status_code == 404
    api.force_authenticate(users["owner"])
    latest = submit(api, edited.data, a)
    api.force_authenticate(users["planner"])
    assert (
        api.post(
            url + "review/",
            {"decision": "approve", "expected_updated_at": pending["updated_at"]},
            format="json",
        ).status_code
        == 409
    )
    assert (
        api.post(
            url + "review/",
            {
                "decision": "decline",
                "expected_updated_at": latest["updated_at"],
                "note": "Please check the key.",
            },
            format="json",
        ).status_code
        == 200
    )
    api.force_authenticate(users["owner"])
    assert api.get(url).data["submission"]["note"] == "Please check the key."
    assert not Hymn.objects.exists()
    api.force_authenticate(users["admin"])
    assert api.get(url).status_code == 200


def test_pending_hymns_cannot_be_added_to_masses_and_keep_category_references(submissions):
    api, users, a, b, placement, hymn = submissions
    hymn = submit(api, hymn, a)
    with pytest.raises(ReferencedRecord):
        delete_category(MassPlacement, placement.pk, users["admin"])
    api.force_authenticate(users["planner"])
    headers = {"HTTP_X_CHOIR_ID": str(a.id)}
    mass = api.post(
        "/api/v1/masses/",
        {"date": "2099-01-01", "title": "Review safety"},
        format="json",
        **headers,
    )
    assert mass.status_code == 201
    result = api.put(
        f"/api/v1/masses/{mass.data['id']}/program/",
        {"selections": [{"hymn_id": hymn["id"], "placement_id": placement.pk, "position": 0}]},
        format="json",
        HTTP_X_EXPECTED_MASS_REVISION=str(mass.data["revision"]),
        **headers,
    )
    assert result.status_code == 400
    assert api.get("/api/v1/hymns/?never_used=true", **headers).data["count"] == 0
    assert api.get("/api/v1/hymns/?ordering=newest_added").data["count"] == 0
    assert api.get(f"/api/v1/hymns/review-queue/?choir_id={b.id}").status_code == 404


def test_only_owner_or_admin_can_remove_unpublished_hymns(submissions):
    api, users, a, b, placement, hymn = submissions
    url = f"/api/v1/hymns/{hymn['id']}/"
    hymn = submit(api, hymn, a)
    api.force_authenticate(users["planner"])
    assert api.delete(url).status_code == 404
    api.force_authenticate(users["owner"])
    assert api.delete(url).status_code == 204
    assert not Hymn.all_objects.filter(pk=hymn["id"]).exists()


def test_members_without_a_choir_keep_private_copies_and_cannot_bypass_limits(submissions):
    from accounts.models import RateBucket

    api, users, a, b, placement, hymn = submissions
    Membership.objects.filter(user=users["owner"]).delete()
    assert api.get(f"/api/v1/hymns/{hymn['id']}/").status_code == 200
    assert (
        api.post(
            f"/api/v1/hymns/{hymn['id']}/submit/",
            {"choir_id": a.id, "expected_updated_at": hymn["updated_at"]},
            format="json",
        ).status_code
        == 404
    )
    RateBucket.objects.update(attempts=1000)
    assert (
        api.patch(f"/api/v1/hymns/{hymn['id']}/", {"title": "Limited"}, format="json").status_code
        == 429
    )


def test_migration_reversal_refuses_to_expose_private_material(submissions):
    import importlib

    from django.apps import apps
    from django.db import connection
    from django.db.migrations.exceptions import IrreversibleError

    migration = importlib.import_module("hymns.migrations.0006_member_submissions")
    with connection.schema_editor() as editor:
        with pytest.raises(IrreversibleError, match="Unpublished hymns"):
            migration.prevent_private_data_exposure(apps, editor)


@pytest.mark.django_db(transaction=True)
def test_approval_and_member_edit_cannot_publish_an_unreviewed_version(submissions):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier

    from django.db import close_old_connections, connections
    from rest_framework.exceptions import APIException

    from hymns.services import review_hymn, save_hymn

    api, users, a, b, placement, hymn = submissions
    pending = submit(api, hymn, a)
    version = Hymn.all_objects.get(pk=hymn["id"]).updated_at
    barrier = Barrier(2)

    def race(operation):
        close_old_connections()
        try:
            barrier.wait(timeout=10)
            operation()
            return "saved"
        except APIException:
            return "rejected"
        finally:
            connections.close_all()

    with ThreadPoolExecutor(max_workers=2) as pool:
        approval = pool.submit(
            race, lambda: review_hymn(users["planner"], hymn["id"], "approve", version)
        )
        edit = pool.submit(
            race, lambda: save_hymn({"title": "Unreviewed replacement"}, users["owner"], hymn["id"])
        )
        result = [approval.result(timeout=15), edit.result(timeout=15)]
    assert sorted(result) == ["rejected", "saved"]
    saved = Hymn.all_objects.get(pk=hymn["id"])
    assert (saved.publication_status, saved.title) in [
        ("published", pending["title"]),
        ("private", "Unreviewed replacement"),
    ]
