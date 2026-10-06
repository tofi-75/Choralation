"""Private PDF storage and bounded validation; filenames never become public paths.

Signature checks establish PDF framing, not a malware scan. Authenticated reads
download attachments with nosniff; the API never serves uploads as executable HTML.
"""

from pathlib import Path
from uuid import uuid4

from django.core.exceptions import ValidationError

MAX_PDF_BYTES = 10 * 1024 * 1024


def pdf_upload_path(instance, filename: str) -> str:
    """Generate an opaque storage key independent of the supplied filename."""
    return f"sheet-music/{uuid4().hex}.pdf"


def validate_pdf(upload) -> None:
    """Reject empty/oversized/non-PDF uploads without consuming the file cursor.

    Accept PDF 1.x/2.0 headers and an EOF marker near the end. Storage and download
    permissions are enforced separately by the hymn mutation/read services.
    """
    if Path(upload.name).suffix.lower() != ".pdf":
        raise ValidationError("Choose a PDF file (.pdf).")
    if not 0 < upload.size <= MAX_PDF_BYTES:
        raise ValidationError("Choose a nonempty PDF of at most 10 MB.")
    position = upload.tell()
    try:
        upload.seek(0)
        header = upload.read(8)
        upload.seek(max(0, upload.size - 2048))
        tail = upload.read(2048)
    finally:
        upload.seek(position)
    if (
        not (header.startswith(b"%PDF-1.") or header.startswith(b"%PDF-2.0"))
        or b"%%EOF" not in tail
    ):
        raise ValidationError("This file does not have valid PDF framing.")
