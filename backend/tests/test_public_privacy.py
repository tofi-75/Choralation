"""Public policy HTML requires neither JavaScript nor an available auth API."""

from unittest.mock import patch

import pytest
from django.contrib.auth.models import AnonymousUser
from django.core.exceptions import ImproperlyConfigured
from django.test import Client, RequestFactory

from common.public_pages import information
from config.account_email import public_origin


@pytest.fixture(autouse=True)
def source_static_files(settings):
    # Unit rendering does not run collectstatic; production smoke verifies the manifest.
    settings.STORAGES = {
        **settings.STORAGES,
        "staticfiles": {"BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage"},
    }


@pytest.mark.parametrize("page", ["about", "privacy", "terms"])
def test_public_pages_are_real_anonymous_html(page):
    response = Client().get("/" + page)
    assert response.status_code == 200
    html = response.content.decode()
    assert "Toufic Lattouf" in html and "Lebanon" in html
    assert "tofi.lattouf@gmail.com" in html
    assert '<html lang="en">' in html and "<h1>" in html
    assert "<script" not in html and 'id="root"' not in html
    assert all(f'href="/{path}"' in html for path in ("about", "privacy", "terms"))
    assert "default-src 'none'" in response["Content-Security-Policy"]
    assert response["Referrer-Policy"] == "no-referrer"
    assert not response.cookies
    assert Client().get("/" + page + "/").status_code == 200
    assert Client().post("/" + page).status_code == 405


def test_policy_discloses_real_audiences_retention_and_google_limits():
    html = Client().get("/privacy").content.decode()
    for text in (
        "gmail.send",
        "Limited Use",
        "24 hours",
        "one hour",
        "30 days",
        "shared hymn library",
        "Render",
        "Supabase",
        "Lebanon",
        "timing",
        "backup",
        "end-to-end",
    ):
        assert text in html
    for forbidden in ("GMAIL_CLIENT_SECRET", "GMAIL_REFRESH_TOKEN", "#token=", "DATABASE_URL"):
        assert forbidden not in html


def test_information_view_does_not_require_authentication_or_database():
    request = RequestFactory().get("/privacy")
    request.user = AnonymousUser()
    with patch(
        "django.db.backends.utils.CursorWrapper.execute",
        side_effect=RuntimeError("Database unavailable"),
    ):
        assert information(request, "privacy").status_code == 200


@pytest.mark.parametrize(
    "url",
    [
        "https://user:secret@example.test",
        "https://example.test/path",
        "https://example.test?x=1",
        "https://example.test#secret",
        "//example.test",
        "http://example.test",
        "https://example.test:99999",
        "https://exa mple.test",
        "https://example.test\\evil",
    ],
)
def test_account_origin_rejects_ambiguous_or_unsafe_values(url):
    with pytest.raises(ImproperlyConfigured):
        public_origin(url)


def test_development_loopback_and_https_origins():
    assert public_origin("http://localhost:5173/") == "http://localhost:5173"
    assert (
        public_origin("https://choralation.onrender.com", require_https=True)
        == "https://choralation.onrender.com"
    )
    with pytest.raises(ImproperlyConfigured):
        public_origin("http://localhost:5173", require_https=True)
