"""Calendar boundary, private API, upstream validation and offline fallback regressions."""

from datetime import date
from io import BytesIO
from unittest.mock import patch

import pytest
from django.core.cache import cache
from django.test import override_settings
from rest_framework.test import APIClient

from hymns.models import LiturgicalSeason
from masses.calendar import easter_sunday, feed_title, local_season, title_season


@pytest.mark.parametrize(
    ("day", "season"),
    [
        ("2026-01-05", "birth-of-our-lord"),
        ("2026-01-06", "epiphany"),
        ("2026-01-24", "epiphany"),
        ("2026-01-25", "commemorations"),
        ("2026-02-14", "commemorations"),
        ("2026-02-15", "great-lent"),
        ("2026-03-28", "great-lent"),
        ("2026-03-29", "passion-week"),
        ("2026-04-04", "passion-week"),
        ("2026-04-05", "resurrection"),
        ("2026-05-23", "resurrection"),
        ("2026-05-24", "pentecost"),
        ("2026-09-13", "pentecost"),
        ("2026-09-14", "holy-cross"),
        ("2026-10-31", "holy-cross"),
        ("2026-11-01", "birth-of-our-lord"),
        ("2026-12-25", "birth-of-our-lord"),
        ("2027-11-06", "holy-cross"),
        ("2027-11-07", "birth-of-our-lord"),
    ],
)
def test_maronite_boundaries(day, season):
    assert local_season(date.fromisoformat(day)) == season


def test_gregorian_easter_and_explicit_arabic_title_mapping():
    assert easter_sunday(2025) == date(2025, 4, 20)
    assert easter_sunday(2026) == date(2026, 4, 5)
    assert easter_sunday(2027) == date(2027, 3, 28)
    assert title_season("الأحد الرابع بعد عيد الصليب: مثل العبد الأمين الحكيم") == "holy-cross"
    assert title_season("أحد تقديس البيعة") == "birth-of-our-lord"
    assert title_season("مار مارون") is None


@override_settings(MARONITE_FEED_ENABLED=True)
def test_feed_cached_and_limited_to_documented_horizon():
    cache.clear()
    with (
        patch("masses.calendar.timezone.localdate", return_value=date(2026, 10, 8)),
        patch(
            "masses.calendar.urlopen", return_value=BytesIO("الأحد بعد عيد الصليب".encode())
        ) as upstream,
    ):
        assert feed_title(date(2026, 10, 11)) == "الأحد بعد عيد الصليب"
        assert feed_title(date(2026, 10, 11)) == "الأحد بعد عيد الصليب"
        assert feed_title(date(2027, 1, 1)) is None
        upstream.assert_called_once()
        assert "lang=MAA" in upstream.call_args.args[0].full_url
        assert upstream.call_args.kwargs["timeout"] == 3


@pytest.mark.parametrize("payload", [b"<html>Error: wrong param</html>", b"", b"x" * 4097])
@override_settings(MARONITE_FEED_ENABLED=True)
def test_unusable_feed_uses_local_fallback(payload):
    cache.clear()
    with (
        patch("masses.calendar.timezone.localdate", return_value=date(2026, 10, 8)),
        patch("masses.calendar.urlopen", return_value=BytesIO(payload)),
    ):
        assert feed_title(date(2026, 10, 11)) is None


@pytest.mark.django_db
@override_settings(MARONITE_FEED_ENABLED=False)
def test_calendar_requires_auth_and_never_creates_or_reactivates_choices(django_user_model):
    api = APIClient()
    assert api.get("/api/v1/calendar/maronite/?date=2026-10-11").status_code == 403
    api.force_authenticate(django_user_model.objects.create_user(username="calendar-viewer"))
    season, _ = LiturgicalSeason.objects.get_or_create(
        slug="holy-cross", defaults={"name": "Holy Cross"}
    )
    response = api.get("/api/v1/calendar/maronite/?date=2026-10-11")
    assert response.status_code == 200
    assert response.data["season_id"] == season.pk
    assert response.data["source"] == "local"
    season.is_active = False
    season.save()
    count = LiturgicalSeason.objects.count()
    assert api.get("/api/v1/calendar/maronite/?date=2026-10-11").data["season_id"] is None
    assert LiturgicalSeason.objects.count() == count
    for day in ("not-a-date", "2026-02-30", "1800-01-01", "2200-01-01"):
        assert api.get("/api/v1/calendar/maronite/", {"date": day}).status_code == 400
    for query in ("date=2026-10-11&unexpected=yes", "date=2026-10-11&date=2026-10-18"):
        assert api.get("/api/v1/calendar/maronite/?" + query).status_code == 400
