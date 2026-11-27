"""Lossless private PDF representations, bounded before decoding and hash checked."""

import gzip
import hashlib
import io
import zlib

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.files.base import ContentFile

from common.storage import StorageUnavailable
from hymns.uploads import MAX_PDF_BYTES, pdf_upload_path, validate_pdf

MAX_STORED_BYTES = MAX_PDF_BYTES + 65536


def digest(data):
    return hashlib.sha256(data).hexdigest()


def pack_pdf(data):
    validate_pdf(ContentFile(data, name="sheet.pdf"))
    return gzip.compress(data, compresslevel=6, mtime=0)


def read_pdf(hymn):
    """Return stored and original bytes; never allow unbounded gzip inflation."""
    with hymn.sheet_music_pdf.open("rb") as handle:
        stored = handle.read(MAX_STORED_BYTES + 1)
    return stored, decode_pdf(hymn, stored)


def decode_pdf(hymn, stored):
    """Validate bounded stored bytes consistently for downloads and release checks."""
    try:
        if len(stored) > MAX_STORED_BYTES:
            raise ValueError("Stored PDF too large")
        if hymn.sheet_music_pdf_encoding == "gzip":
            with gzip.GzipFile(fileobj=io.BytesIO(stored)) as reader:
                original = reader.read(MAX_PDF_BYTES + 1)
        elif hymn.sheet_music_pdf_encoding == "identity":
            original = stored
        else:
            raise ValueError("Unknown PDF encoding")
        validate_pdf(ContentFile(original, name="sheet.pdf"))
        if hymn.sheet_music_pdf_size is not None and len(original) != hymn.sheet_music_pdf_size:
            raise ValueError("PDF size mismatch")
        if hymn.sheet_music_pdf_sha256 and digest(original) != hymn.sheet_music_pdf_sha256:
            raise ValueError("PDF checksum mismatch")
    except (ValueError, OSError, EOFError, zlib.error, ValidationError) as error:
        raise StorageUnavailable() from error
    return original


def prepare_upload(hymn, upload):
    upload.seek(0)
    original = upload.read(MAX_PDF_BYTES + 1)
    validate_pdf(ContentFile(original, name=upload.name))
    compressed = settings.PDF_COMPRESSED_WRITES
    encoded = pack_pdf(original) if compressed else original
    hymn.sheet_music_pdf_encoding = "gzip" if compressed else "identity"
    hymn.sheet_music_pdf_size = len(original)
    hymn.sheet_music_pdf_sha256 = digest(original)
    return pdf_upload_path(hymn, upload.name) + (".gz" if compressed else ""), ContentFile(encoded)


def accepts_gzip(header):
    """Explicit gzip exclusion wins over a wildcard; malformed q-values are refused."""
    qualities = {}
    for item in header.lower().split(","):
        parts = [part.strip() for part in item.split(";")]
        quality = 1.0
        for parameter in parts[1:]:
            if parameter.startswith("q="):
                try:
                    quality = float(parameter[2:])
                except ValueError:
                    quality = 0
        qualities[parts[0]] = quality if 0 <= quality <= 1 else 0
    return qualities.get("gzip", qualities.get("*", 0)) > 0


def delete_unreferenced(storage, name):
    from hymns.models import Hymn

    if name and not Hymn.all_objects.filter(sheet_music_pdf=name).exists():
        storage.delete(name)
