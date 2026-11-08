"""Calendar boundary, private API, upstream validation and offline fallback regressions."""

from datetime import date
from importlib import import_module
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from choir_fixtures import choir_client, choir_member
from django.apps import apps
from django.core.cache import cache
from django.db import connection
from django.test import override_settings

from choirs.models import CalendarOverride, CalendarSettings, Choir
from hymns.models import Hymn, Language, LiturgicalSeason
from masses.calendar import MARONITE_SEASONS, easter_sunday, feed_title, local_season, title_season
from masses.models import Mass


@pytest.mark.parametrize(
    ("day", "season"),
    [
        ("2026-01-05", "advent-christmas"),
        ("2026-01-06", "epiphany"),
        ("2026-01-24", "epiphany"),
        ("2026-01-25", "epiphany"),
        ("2026-02-14", "epiphany"),
        ("2026-02-15", "lent"),
        ("2026-03-28", "lent"),
        ("2026-03-29", "passion"),
        ("2026-04-04", "passion"),
        ("2026-04-05", "resurrection"),
        ("2026-05-23", "resurrection"),
        ("2026-05-24", "pentecost"),
        ("2026-09-13", "pentecost"),
        ("2026-09-14", "holy-cross"),
        ("2026-10-31", "holy-cross"),
        ("2026-11-01", "advent-christmas"),
        ("2026-12-24", "advent-christmas"),
        ("2026-12-25", "advent-christmas"),
        ("2027-11-06", "holy-cross"),
        ("2027-11-07", "advent-christmas"),
    ],
)
def test_maronite_boundaries(day, season):
    assert local_season(date.fromisoformat(day)) == season


def test_gregorian_easter_and_explicit_arabic_title_mapping():
    assert easter_sunday(2025) == date(2025, 4, 20)
    assert easter_sunday(2026) == date(2026, 4, 5)
    assert easter_sunday(2027) == date(2027, 3, 28)
    assert title_season("الأحد الرابع بعد عيد الصليب: مثل العبد الأمين الحكيم") == "holy-cross"
    assert title_season("أحد تقديس البيعة") == "advent-christmas"
    assert title_season("أحد الكهنة") == "epiphany"
    assert title_season("أحد مدخل الصوم الكبير") == "lent"
    assert title_season("أحد الشعانين") == "passion"
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
    api = choir_client()
    assert api.get("/api/v1/calendar/maronite/?date=2026-10-11").status_code == 403
    user = django_user_model.objects.create_user(username="calendar-viewer")
    choir_member(user)
    api.force_authenticate(user)
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


@pytest.mark.django_db
def test_season_consolidation_keeps_hymns_masses_and_choir_overrides():
    migration = import_module("hymns.migrations.0007_main_liturgical_seasons")
    legacy, _ = LiturgicalSeason.objects.update_or_create(
        slug="commemorations", defaults={"name": "Commemorations", "is_active": True}
    )
    epiphany, _ = LiturgicalSeason.objects.update_or_create(
        slug="epiphany", defaults={"name": "Epiphany", "is_active": False}
    )
    language = Language.objects.create(name="Migration language", slug="migration-language")
    hymn = Hymn.all_objects.create(
        title="Private hymn", language=language, publication_status="private"
    )
    hymn.seasons.add(legacy, epiphany)
    choir = Choir.objects.create(name="Migration choir")
    config = CalendarSettings.objects.create(choir=choir, version=4)
    override = CalendarOverride.objects.create(choir=choir, season=legacy, date="2026-02-01")
    mass = Mass.objects.create(
        choir=choir, title="Saved Mass", date="2026-02-01", liturgical_season=legacy, revision=5
    )

    for _ in range(2):
        migration.consolidate_seasons(apps, SimpleNamespace(connection=connection))

    assert list(
        LiturgicalSeason.objects.filter(is_active=True).values_list("slug", "name")
    ) == list(MARONITE_SEASONS.items())
    hymn.refresh_from_db()
    assert list(hymn.seasons.values_list("pk", flat=True)) == [epiphany.pk]
    assert hymn.publication_status == "private"
    mass.refresh_from_db()
    assert (mass.liturgical_season_id, mass.revision) == (epiphany.pk, 6)
    override.refresh_from_db()
    config.refresh_from_db()
    assert (override.season_id, config.version) == (epiphany.pk, 5)
    legacy.refresh_from_db()
    assert not legacy.is_active
