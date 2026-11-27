"""Exercise the archived application only against a disposable restored database."""

import importlib.util
import os

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django

django.setup()

from django.core.management import call_command  # noqa: E402
from rest_framework.test import APIClient  # noqa: E402

from hymns.models import Hymn  # noqa: E402

call_command("check", verbosity=0)
rows = Hymn.all_objects.exclude(sheet_music_pdf="").filter(is_active=True)
checked = set()
for hymn in rows.iterator():
    # Owner identity covers private submissions, and bypasses no endpoint permission checks.
    owner = hymn.created_by
    if not owner or not owner.is_active:
        continue
    encoding = getattr(hymn, "sheet_music_pdf_encoding", "identity")
    if encoding in checked:
        continue
    api = APIClient()
    api.force_authenticate(owner)
    response = api.get(f"/api/v1/hymns/{hymn.pk}/sheet-music/", HTTP_ACCEPT_ENCODING="identity")
    if response.status_code != 200 or not b"".join(response.streaming_content).startswith(b"%PDF-"):
        raise RuntimeError("Restored authenticated PDF access failed.")
    anonymous = APIClient().get(f"/api/v1/hymns/{hymn.pk}/sheet-music/")
    if anonymous.status_code not in {401, 403}:
        raise RuntimeError("Restored anonymous PDF access was not denied.")
    checked.add(encoding)
if not checked:
    # Do not pass a production restore rehearsal without the promised PDF permission check.
    raise RuntimeError("Restore rehearsal needs an active uploaded PDF with an active owner.")

# New snapshots exercise the operational storage read against the real temporary
# TLS S3 service. Historical releases predating this endpoint remain restorable.
if importlib.util.find_spec("common.deployment_checks") is not None:
    from common.deployment_checks import check_pdf_storage

    check_pdf_storage()

print("Restored application checks and authenticated/anonymous PDF permissions passed.")
