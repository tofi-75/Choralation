"""Exact PDF roundtrips, negotiation, bounded inflation and safe resumable conversion."""

import gzip
from io import StringIO
from unittest.mock import patch

import pytest
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from rest_framework.test import APIClient

from hymns.management.commands.compress_pdfs import convert_pdf
from hymns.models import Hymn, Language, MassPlacement
from hymns.pdf_storage import accepts_gzip, digest, read_pdf
from hymns.services import delete_hymn, save_hymn
from hymns.uploads import MAX_PDF_BYTES

PDF = b"%PDF-1.7\n" + b"original PDF content\n" * 100 + b"%%EOF\n"


@pytest.fixture
def attachment(settings, tmp_path):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    settings.MEDIA_ROOT = tmp_path
    settings.PDF_COMPRESSED_WRITES = True
    actor = get_user_model().objects.create_superuser(username="compression-admin")
    language = Language.objects.create(name="Compress", slug="compress")
    placement = MassPlacement.objects.create(name="Compress", slug="compress")
    hymn = save_hymn(
        {
            "title": "Exact bytes",
            "language_id": language.pk,
            "placement_ids": [placement.pk],
            "is_season_neutral": True,
            "sheet_music_pdf": SimpleUploadedFile("original.pdf", PDF),
        },
        actor,
    )
    return hymn, actor


@pytest.mark.parametrize(
    ("header", "allowed"),
    [
        ("gzip", True),
        ("br, gzip;q=0.5", True),
        ("gzip;q=0,*;q=1", False),
        ("*;q=1", True),
        ("gzip;q=bad", False),
        ("gzip;q=2", False),
        ("identity", False),
        ("", False),
    ],
)
def test_gzip_negotiation(header, allowed):
    assert accepts_gzip(header) == allowed


@pytest.mark.django_db
def test_upload_download_integrity_and_fallback(attachment):
    hymn, actor = attachment
    stored, original = read_pdf(hymn)
    assert original == PDF and gzip.decompress(stored) == PDF
    assert len(stored) < len(PDF)
    assert hymn.sheet_music_pdf_size == len(PDF)
    assert hymn.sheet_music_pdf_sha256 == digest(PDF)
    api = APIClient()
    path = f"/api/v1/hymns/{hymn.pk}/sheet-music/"
    assert api.get(path).status_code == 403
    api.force_authenticate(actor)
    for header, encoded in [("gzip", True), ("gzip;q=0,*;q=1", False), ("identity", False)]:
        response = api.get(path, HTTP_ACCEPT_ENCODING=header)
        body = b"".join(response.streaming_content)
        assert (gzip.decompress(body) if encoded else body) == PDF
        assert response.get("Content-Encoding") == ("gzip" if encoded else None)
        assert int(response["Content-Length"]) == len(body)
        assert "original.pdf" in response["Content-Disposition"]
        assert response["Content-Type"] == "application/pdf"
        assert "Accept-Encoding" in response["Vary"]
        assert response["Cache-Control"] == "no-store"


@pytest.mark.django_db
@pytest.mark.parametrize("failure", ["corrupt", "oversized", "hash", "size"])
def test_invalid_encoded_files_are_sanitized_and_bounded(attachment, failure):
    hymn, actor = attachment
    if failure in ["corrupt", "oversized"]:
        data = (
            b"private-invalid-gzip"
            if failure == "corrupt"
            else gzip.compress(b"x" * (MAX_PDF_BYTES + 1))
        )
        storage = hymn.sheet_music_pdf.storage
        storage.delete(hymn.sheet_music_pdf.name)
        storage.save(hymn.sheet_music_pdf.name, ContentFile(data))
    elif failure == "hash":
        Hymn.all_objects.filter(pk=hymn.pk).update(sheet_music_pdf_sha256="0" * 64)
    else:
        Hymn.all_objects.filter(pk=hymn.pk).update(sheet_music_pdf_size=1)
    api = APIClient()
    api.force_authenticate(actor)
    response = api.get(f"/api/v1/hymns/{hymn.pk}/sheet-music/", HTTP_ACCEPT_ENCODING="gzip")
    assert response.status_code == 503
    assert "private-invalid-gzip" not in str(response.data)


@pytest.mark.django_db
def test_replace_remove_delete_clean_encoded_objects(
    attachment, django_capture_on_commit_callbacks
):
    hymn, actor = attachment
    old = hymn.sheet_music_pdf.name
    storage = hymn.sheet_music_pdf.storage
    with django_capture_on_commit_callbacks(execute=True):
        hymn = save_hymn(
            {"sheet_music_pdf": SimpleUploadedFile("replacement.pdf", PDF + b"\n")}, actor, hymn.pk
        )
    assert not storage.exists(old)
    new = hymn.sheet_music_pdf.name
    with django_capture_on_commit_callbacks(execute=True):
        hymn = save_hymn({"remove_sheet_music_pdf": True}, actor, hymn.pk)
    assert not storage.exists(new)
    assert (
        hymn.sheet_music_pdf_encoding,
        hymn.sheet_music_pdf_size,
        hymn.sheet_music_pdf_sha256,
    ) == ("identity", None, "")
    hymn = save_hymn({"sheet_music_pdf": SimpleUploadedFile("again.pdf", PDF)}, actor, hymn.pk)
    name = hymn.sheet_music_pdf.name
    with django_capture_on_commit_callbacks(execute=True):
        delete_hymn(hymn.pk, actor)
    assert not storage.exists(name)


@pytest.mark.django_db
def test_conversion_is_dry_run_resumable_and_preserves_private_metadata(
    attachment, settings, django_capture_on_commit_callbacks
):
    hymn, actor = attachment
    settings.PDF_COMPRESSED_WRITES = False
    hymn = save_hymn({"sheet_music_pdf": SimpleUploadedFile("legacy.pdf", PDF)}, actor, hymn.pk)
    Hymn.all_objects.filter(pk=hymn.pk).update(publication_status="private")
    hymn.refresh_from_db()
    before = (hymn.updated_at, hymn.updated_by_id, hymn.sheet_music_pdf_name)
    old = hymn.sheet_music_pdf.name
    output = StringIO()
    call_command("compress_pdfs", stdout=output)
    assert "dry run" in output.getvalue()
    hymn.refresh_from_db()
    assert hymn.sheet_music_pdf.name == old
    settings.PDF_COMPRESSED_WRITES = True
    with django_capture_on_commit_callbacks(execute=True):
        call_command("compress_pdfs", apply=True, stdout=StringIO())
    hymn.refresh_from_db()
    assert hymn.publication_status == "private"
    assert (hymn.updated_at, hymn.updated_by_id, hymn.sheet_music_pdf_name) == before
    assert read_pdf(hymn)[1] == PDF
    assert not hymn.sheet_music_pdf.storage.exists(old)
    output = StringIO()
    call_command("compress_pdfs", apply=True, stdout=output)
    assert not output.getvalue()


@pytest.mark.django_db
def test_conversion_race_keeps_replacement_and_cleans_own_unused_object(attachment, settings):
    hymn, actor = attachment
    settings.PDF_COMPRESSED_WRITES = False
    hymn = save_hymn({"sheet_music_pdf": SimpleUploadedFile("legacy.pdf", PDF)}, actor, hymn.pk)
    storage = hymn.sheet_music_pdf.storage
    real_read = read_pdf

    def replace_during_verification(item):
        result = real_read(item)
        if item.sheet_music_pdf_encoding == "gzip":
            save_hymn(
                {"sheet_music_pdf": SimpleUploadedFile("concurrent.pdf", PDF + b"\n")},
                actor,
                hymn.pk,
            )
        return result

    with patch(
        "hymns.management.commands.compress_pdfs.read_pdf", side_effect=replace_during_verification
    ):
        assert "skipped" in convert_pdf(hymn, apply=True)
    unused = hymn.sheet_music_pdf.name
    hymn.refresh_from_db()
    assert hymn.sheet_music_pdf_name == "concurrent.pdf"
    assert read_pdf(hymn)[1] == PDF + b"\n"
    assert not storage.exists(unused)


@pytest.mark.django_db
def test_shared_old_reference_prevents_conversion_cleanup(
    attachment, settings, django_capture_on_commit_callbacks
):
    hymn, actor = attachment
    settings.PDF_COMPRESSED_WRITES = False
    hymn = save_hymn({"sheet_music_pdf": SimpleUploadedFile("legacy.pdf", PDF)}, actor, hymn.pk)
    old = hymn.sheet_music_pdf.name
    Hymn.all_objects.create(
        title="Private shared key",
        language=hymn.language,
        publication_status="private",
        sheet_music_pdf=old,
    )
    with django_capture_on_commit_callbacks(execute=True):
        convert_pdf(hymn, apply=True)
    assert hymn.sheet_music_pdf.storage.exists(old)
