"""Resumable, compare-and-swap conversion of existing private attachments."""

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.management.base import CommandError
from django.db import transaction

from common.management import GuardedCommand
from hymns.models import Hymn
from hymns.pdf_storage import delete_unreferenced, digest, pack_pdf, read_pdf
from hymns.uploads import pdf_upload_path


def convert_pdf(hymn, *, apply=False):
    old_name = hymn.sheet_music_pdf.name
    storage = hymn.sheet_music_pdf.storage
    _, original = read_pdf(hymn)
    compressed = pack_pdf(original)
    if not apply:
        return f"{len(original)} -> {len(compressed)} bytes (dry run)"
    new_name = storage.save(pdf_upload_path(hymn, "sheet.pdf") + ".gz", ContentFile(compressed))
    try:
        # Verify the actual stored object before switching references.
        # Replace FieldFile itself: changing .name could reopen its cached old handle.
        hymn.sheet_music_pdf = new_name
        hymn.sheet_music_pdf_encoding = "gzip"
        hymn.sheet_music_pdf_size = len(original)
        hymn.sheet_music_pdf_sha256 = digest(original)
        _, verified = read_pdf(hymn)
        if verified != original:
            raise CommandError("Stored PDF verification failed.")
        with transaction.atomic():
            current = Hymn.all_objects.select_for_update().filter(pk=hymn.pk).first()
            if (
                current is None
                or current.sheet_music_pdf.name != old_name
                or current.sheet_music_pdf_encoding != "identity"
            ):
                return "skipped (attachment changed)"
            Hymn.all_objects.filter(pk=current.pk).update(
                sheet_music_pdf=new_name,
                sheet_music_pdf_encoding="gzip",
                sheet_music_pdf_size=len(original),
                sheet_music_pdf_sha256=digest(original),
            )
            transaction.on_commit(lambda: delete_unreferenced(storage, old_name), robust=True)
        return f"{len(original)} -> {len(compressed)} bytes (converted)"
    finally:
        delete_unreferenced(storage, new_name)


class Command(GuardedCommand):
    help = "Dry-run PDF gzip conversion; --apply switches references after readback verification. Back up database AND media first."

    def add_arguments(self, parser):
        parser.add_argument("--apply", action="store_true")
        parser.add_argument("--after-id", type=int, default=0)
        parser.add_argument("--limit", type=int, default=100)

    def handle(self, *args, **options):
        if options["apply"] and not settings.PDF_COMPRESSED_WRITES:
            raise CommandError(
                "Enable PDF_COMPRESSED_WRITES after deploying dual readers before applying conversion."
            )
        if options["limit"] < 1 or options["after_id"] < 0:
            raise CommandError("Use a positive limit and nonnegative after-id.")
        rows = (
            Hymn.all_objects.filter(pk__gt=options["after_id"], sheet_music_pdf_encoding="identity")
            .exclude(sheet_music_pdf="")
            .order_by("pk")[: options["limit"]]
        )
        for hymn in rows:
            try:
                result = convert_pdf(hymn, apply=options["apply"])
            except Exception:
                self.stderr.write(
                    f"Hymn {hymn.pk}: inaccessible, missing or invalid attachment; skipped."
                )
            else:
                self.stdout.write(f"Hymn {hymn.pk}: {result}")
