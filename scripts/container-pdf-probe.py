"""Isolated CI probe run inside each fresh app container, never against hosted data."""

import base64
import hashlib
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit


def main():
    target = urlsplit(os.environ.get("DATABASE_URL", ""))
    storage = urlsplit(os.environ.get("AWS_S3_ENDPOINT_URL", ""))
    if (
        target.hostname not in {"127.0.0.1", "localhost"}
        or target.path != "/choralation_production_smoke"
        or storage.hostname not in {"127.0.0.1", "localhost"}
    ):
        raise RuntimeError(
            "This probe only accepts the isolated loopback CI database and object store."
        )
    sys.path.insert(0, os.getcwd())
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")
    import django

    django.setup()
    from django.conf import settings
    from django.contrib.auth import get_user_model
    from django.core.files.storage import storages
    from django.core.files.uploadedfile import SimpleUploadedFile
    from django.test import Client
    from storages.backends.s3 import S3Storage

    from hymns.models import Hymn, Language, MassPlacement

    assert isinstance(storages["default"], S3Storage)
    data = json.load(sys.stdin)
    if data["phase"] == "create":
        user = get_user_model().objects.create_user(username=data["username"])
    else:
        user = get_user_model().objects.get(username=data["username"])
    client = Client(
        enforce_csrf_checks=True,
        HTTP_X_FORWARDED_PROTO="https",
        HTTP_ORIGIN="https://testserver",
        HTTP_HOST="testserver",
    )
    client.force_login(user, backend="accounts.backends.EmailOrUsernameBackend")
    csrf = client.get("/api/v1/auth/csrf/").json()["csrf_token"]
    if data["phase"] == "create":
        response = client.post(
            "/api/v1/hymns/",
            {
                "data": json.dumps(
                    {
                        "title": "Fictional durable PDF check",
                        "language_id": Language.objects.first().pk,
                        "placement_ids": [MassPlacement.objects.filter(is_active=True).first().pk],
                        "is_season_neutral": True,
                    }
                ),
                "sheet_music_pdf": SimpleUploadedFile(
                    "fictional.pdf", base64.b64decode(data["pdf"]), content_type="application/pdf"
                ),
            },
            HTTP_X_CSRFTOKEN=csrf,
        )
        assert response.status_code == 201, response.json()
        hymn = Hymn.all_objects.get(pk=response.json()["id"])
        assert hymn.publication_status == "private"
    else:
        hymn = Hymn.all_objects.get(pk=data["id"], created_by=user)
    url = f"/api/v1/hymns/{hymn.pk}/"
    key = hymn.sheet_music_pdf.name
    if data["phase"] == "replace":
        from django.test.client import BOUNDARY, encode_multipart

        response = client.patch(
            url,
            encode_multipart(
                BOUNDARY,
                {
                    "data": "{}",
                    "sheet_music_pdf": SimpleUploadedFile(
                        "replacement.pdf",
                        base64.b64decode(data["pdf"]),
                        content_type="application/pdf",
                    ),
                },
            ),
            content_type=f"multipart/form-data; boundary={BOUNDARY}",
            HTTP_X_CSRFTOKEN=csrf,
        )
        assert response.status_code == 200, response.json()
        hymn.refresh_from_db()
        assert hymn.sheet_music_pdf.name != key and not storages["default"].exists(key)
        key = hymn.sheet_music_pdf.name
    response = client.get(url + "sheet-music/")
    assert response.status_code == 200, response.json()
    actual = b"".join(response.streaming_content)
    response.close()
    assert hashlib.sha256(actual).hexdigest() == data["sha256"]
    if "key" in data and data["phase"] != "replace":
        assert key == data["key"]
    assert not (Path(settings.MEDIA_ROOT) / key).exists(), (
        "PDF unexpectedly stored in container filesystem"
    )
    assert Client(HTTP_X_FORWARDED_PROTO="https").get(url + "sheet-music/").status_code == 403
    assert client.get("/api/v1/hymns/?q=Fictional%20durable%20PDF%20check").json()["count"] == 0
    result = {"id": hymn.pk, "key": key, "sha256": data["sha256"]}
    if data["phase"] == "cleanup":
        assert client.delete(url, HTTP_X_CSRFTOKEN=csrf).status_code == 204
        assert not storages["default"].exists(key)
        user.delete()
    print(json.dumps(result))


if __name__ == "__main__":
    main()
