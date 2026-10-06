"""Review acceptance: private PDFs, filesystem failure recovery, and saved voices."""

import json
from unittest.mock import patch

import pytest
from django.contrib.auth.models import Group
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
from rest_framework.test import APIClient

from hymns.models import Hymn, Language, MassPlacement

pytestmark = pytest.mark.django_db


@pytest.fixture
def review_library(django_user_model, settings, tmp_path):
    # Refuse pytest's ordinary outside-project temp directory under the user's constraint.
    assert tmp_path.resolve().is_relative_to(settings.PROJECT_ROOT.resolve())
    settings.MEDIA_ROOT = tmp_path / "media"
    users = {}
    for role in ("Admin", "Planner", "Viewer"):
        user = django_user_model.objects.create_user(username=f"review-{role.lower()}")
        user.groups.add(Group.objects.get(name=role))
        users[role] = user
    api = APIClient()
    api.force_authenticate(users["Planner"])
    language = Language.objects.create(name="Review language", slug="review")
    placement = MassPlacement.objects.create(name="Review placement", slug="review")
    data = {
        "title": "Review hymn",
        "language_id": language.pk,
        "placement_ids": [placement.pk],
        "is_season_neutral": True,
    }
    pdf = (settings.PROJECT_ROOT / "frontend/tests/fixtures/sheet-music.pdf").read_bytes()
    return api, users, data, pdf


def upload(api, data, content, name="score.pdf", pk=None):
    """Use the same multipart envelope as the browser, including replacement PATCH."""
    method = api.patch if pk else api.post
    return method(
        f"/api/v1/hymns/{str(pk) + '/' if pk else ''}",
        {
            "data": json.dumps(data),
            "sheet_music_pdf": SimpleUploadedFile(name, content, content_type="application/pdf"),
        },
        format="multipart",
    )


def test_private_pdf_upload_download_and_role_permissions(review_library):
    api, users, data, pdf = review_library
    created = upload(api, data, pdf, "Arabic score.pdf")
    assert created.status_code == 201, created.data
    record = Hymn.objects.get(pk=created.data["id"])
    assert record.sheet_music_pdf_name == "Arabic score.pdf"
    assert "Arabic" not in record.sheet_music_pdf.name
    attachment = created.data["sheet_music_pdf"]
    assert attachment["url"] == f"/api/v1/hymns/{record.pk}/sheet-music/"
    api.force_authenticate(users["Viewer"])
    downloaded = api.get(attachment["url"])
    assert downloaded.status_code == 200
    assert b"".join(downloaded.streaming_content) == pdf
    assert downloaded["Content-Type"] == "application/pdf"
    assert downloaded["Content-Disposition"].startswith("attachment;")
    assert downloaded["X-Content-Type-Options"] == "nosniff"
    assert upload(api, {}, pdf, pk=record.pk).status_code == 403
    assert (
        api.patch(
            f"/api/v1/hymns/{record.pk}/", {"remove_sheet_music_pdf": True}, format="json"
        ).status_code
        == 403
    )
    api.force_authenticate(None)
    assert api.get(attachment["url"]).status_code == 403


@pytest.mark.parametrize(
    "name,content",
    [
        ("score.txt", b"%PDF-1.4\n%%EOF"),
        ("score.pdf", b"<html>not a PDF</html>"),
        ("score.pdf", b"%PDF-1.4\ntruncated"),
        ("score.pdf", b"%PDF-1.4\n" + b"x" * (10 * 1024 * 1024) + b"%%EOF"),
    ],
    ids=["wrong-extension", "html", "truncated", "oversized"],
)
def test_invalid_pdf_writes_nothing_and_returns_file_error(review_library, name, content):
    api, _, data, _ = review_library
    rejected = upload(api, data, content, name)
    assert rejected.status_code == 400
    assert "sheet_music_pdf" in rejected.data["errors"]
    assert not Hymn.objects.exists()


def test_replace_remove_and_delete_clean_up_only_committed_files(
    review_library, django_capture_on_commit_callbacks
):
    api, users, data, pdf = review_library
    created = upload(api, data, pdf).data
    record = Hymn.objects.get(pk=created["id"])
    storage, old_name = record.sheet_music_pdf.storage, record.sheet_music_pdf.name
    with django_capture_on_commit_callbacks(execute=True):
        replaced = upload(api, {"notes": "Replaced"}, pdf, "new.pdf", record.pk)
        assert replaced.status_code == 200
    record.refresh_from_db()
    assert not storage.exists(old_name) and storage.exists(record.sheet_music_pdf.name)
    assert record.notes == "Replaced" and record.sheet_music_pdf_name == "new.pdf"
    old_name = record.sheet_music_pdf.name
    with django_capture_on_commit_callbacks(execute=True):
        removed = api.patch(
            f"/api/v1/hymns/{record.pk}/", {"remove_sheet_music_pdf": True}, format="json"
        )
        assert removed.status_code == 200 and removed.data["sheet_music_pdf"] is None
    assert not storage.exists(old_name)
    assert api.get(f"/api/v1/hymns/{record.pk}/sheet-music/").status_code == 404
    upload(api, {}, pdf, pk=record.pk)
    record.refresh_from_db()
    old_name = record.sheet_music_pdf.name
    api.force_authenticate(users["Admin"])
    with django_capture_on_commit_callbacks(execute=True):
        assert api.delete(f"/api/v1/hymns/{record.pk}/").status_code == 204
    assert not storage.exists(old_name)


def test_failed_database_save_removes_new_pdf_and_preserves_old_metadata(review_library):
    api, _, data, pdf = review_library
    created = upload(api, data, pdf).data
    record = Hymn.objects.get(pk=created["id"])
    storage = record.sheet_music_pdf.storage
    before = storage.listdir("sheet-music")[1]
    with (
        patch.object(Hymn, "save", side_effect=IntegrityError("Injected database failure")),
        pytest.raises(IntegrityError),
    ):
        upload(api, {"title": "Must not persist"}, pdf, "failed.pdf", record.pk)
    record.refresh_from_db()
    assert record.title == data["title"]
    assert storage.listdir("sheet-music")[1] == before
    assert storage.exists(record.sheet_music_pdf.name)


def test_polyphony_round_trip_retained_patch_and_explicit_voice_clear(review_library):
    api, _, data, _ = review_library
    created = api.post(
        "/api/v1/hymns/",
        {**data, "is_polyphonic": True, "voices": [" Soprano ", "Alto", "تينور"]},
        format="json",
    )
    assert created.status_code == 201
    assert created.data["voices"] == ["Soprano", "Alto", "تينور"]
    url = f"/api/v1/hymns/{created.data['id']}/"
    assert (
        api.patch(url, {"notes": "Retained"}, format="json").data["voices"]
        == created.data["voices"]
    )
    rejected = api.patch(url, {"is_polyphonic": False, "title": "Must roll back"}, format="json")
    assert rejected.status_code == 400 and "voices" in rejected.data["errors"]
    assert api.get(url).data["is_polyphonic"] is True
    cleared = api.patch(url, {"is_polyphonic": False, "voices": []}, format="json")
    assert cleared.status_code == 200 and cleared.data["voices"] == []
    assert cleared.data["title"] == data["title"]


@pytest.mark.parametrize(
    "changes",
    [
        {"voices": ["Soprano"]},
        {"is_polyphonic": True, "voices": [" "]},
        {"is_polyphonic": True, "voices": ["Alto", " alto "]},
        {"is_polyphonic": True, "voices": ["x" * 81]},
    ],
)
def test_invalid_voice_names_are_atomic_field_errors(review_library, changes):
    api, _, data, _ = review_library
    rejected = api.post("/api/v1/hymns/", {**data, **changes}, format="json")
    assert rejected.status_code == 400 and "voices" in rejected.data["errors"]
    assert not Hymn.objects.exists()


def test_multipart_metadata_rejects_invalid_shape_and_conflicting_removal(review_library):
    api, _, data, pdf = review_library
    assert api.post("/api/v1/hymns/", {"data": "[]"}, format="multipart").status_code == 400
    rejected = upload(api, {**data, "remove_sheet_music_pdf": True}, pdf)
    assert rejected.status_code == 400
    assert not Hymn.objects.exists()
