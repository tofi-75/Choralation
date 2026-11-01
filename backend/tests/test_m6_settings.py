"""M6 shared taxonomy safety, per-choir calendar privacy and saved-program preservation."""

from datetime import UTC, date, datetime
from unittest.mock import patch

import pytest
from django.http import QueryDict
from rest_framework.test import APIClient

from choirs.models import CalendarOverride, CalendarSettings, Choir, Membership
from hymns.models import CATEGORY_TYPES, Hymn, Language, LiturgicalSeason, MassPlacement
from masses.models import Mass

pytestmark = pytest.mark.django_db


@pytest.fixture
def setup(settings, django_user_model):
    settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED = False
    settings.MARONITE_FEED_ENABLED = False
    users = {
        n: django_user_model.objects.create_user(username="m6-" + n, is_superuser=n == "admin")
        for n in ["admin", "planner", "member", "outsider"]
    }
    choir = Choir.objects.create(name="M6 private choir")
    for name, role in [("planner", "Planner"), ("member", "Member")]:
        Membership.objects.create(choir=choir, user=users[name], role=role)
    api = APIClient()
    api.force_authenticate(users["admin"])
    return api, users, choir


@pytest.mark.parametrize("kind", list(CATEGORY_TYPES))
def test_shared_category_lifecycle_stale_edits_and_complete_reorder(setup, kind):
    api, users, choir = setup
    base = f"/api/v1/{kind}/"
    rows = []
    for name in ["First", "Second"]:
        r = api.post(base, {"name": name}, format="json")
        assert r.status_code == 201
        rows.append(r.data)
    assert api.post(base, {"name": " FIRST "}, format="json").status_code == 400
    first = rows[0]
    renamed = api.patch(
        base + str(first["id"]) + "/",
        {"name": "Renamed", "expected_updated_at": first["updated_at"]},
        format="json",
    )
    assert renamed.status_code == 200 and renamed.data["slug"] == first["slug"]
    assert (
        api.patch(
            base + str(first["id"]) + "/",
            {"name": "Lost change", "expected_updated_at": first["updated_at"]},
            format="json",
        ).status_code
        == 409
    )
    rows = list(api.get(base + "?is_active=all").data)
    payload = {
        "ordered_ids": [r["id"] for r in reversed(rows)],
        "expected_versions": {str(r["id"]): r["updated_at"] for r in rows},
    }
    assert api.post(base + "reorder/", payload, format="json").status_code == 200
    assert api.post(base + "reorder/", payload, format="json").status_code == 409
    assert api.post(base + "reorder/", {"ordered_ids": []}, format="json").status_code == 400
    api.force_authenticate(users["planner"])
    assert api.post(base, {"name": "Forbidden"}, format="json").status_code == 403
    assert (
        api.patch(base + str(first["id"]) + "/", {"name": "Forbidden"}, format="json").status_code
        == 403
    )
    assert api.delete(base + str(first["id"]) + "/").status_code == 403
    api.force_authenticate(users["admin"])
    assert api.delete(base + str(first["id"]) + "/").status_code == 204


def test_private_hymns_calendar_and_mass_references_protect_categories(setup):
    api, users, choir = setup
    season = LiturgicalSeason.objects.create(name="Custom season", slug="m6-season")
    language = Language.objects.create(name="Custom language", slug="m6-language")
    placement = MassPlacement.objects.create(name="Custom placement", slug="m6-placement")
    hymn = Hymn.all_objects.create(
        title="Private proposal",
        language=language,
        publication_status="private",
        created_by=users["member"],
    )
    hymn.seasons.add(season)
    hymn.placements.add(placement)
    CalendarOverride.objects.create(choir=choir, date="2026-11-01", season=season)
    for kind, row in [
        ("languages", language),
        ("liturgical-seasons", season),
        ("mass-placements", placement),
    ]:
        detail = api.get(f"/api/v1/{kind}/{row.pk}/")
        assert sum(detail.data["reference_counts"].values()) > 0
        assert api.delete(f"/api/v1/{kind}/{row.pk}/").status_code == 409
        assert (
            api.patch(f"/api/v1/{kind}/{row.pk}/", {"is_active": False}, format="json").status_code
            == 200
        )
    hymn.refresh_from_db()
    assert hymn.language_id == language.pk and hymn.placements.filter(pk=placement.pk).exists()


def test_calendar_permissions_validation_versions_and_choir_isolation(setup):
    api, users, choir = setup
    url = f"/api/v1/choirs/{choir.pk}/calendar/"
    other = Choir.objects.create(name="Other choir")
    api.force_authenticate(users["outsider"])
    assert api.get(url).status_code == 404
    api.force_authenticate(users["member"])
    assert api.get(url).data["version"] == 0
    data = {"calendar": "manual", "time_zone": "Pacific/Honolulu", "version": 0}
    assert api.patch(url, data, format="json").status_code == 403
    api.force_authenticate(users["planner"])
    assert api.patch(url, {**data, "time_zone": "Not/AZone"}, format="json").status_code == 400
    result = api.patch(url, data, format="json")
    assert result.status_code == 200 and result.data["version"] == 1
    assert api.patch(url, data, format="json").status_code == 409
    assert api.get(f"/api/v1/choirs/{other.pk}/calendar/").status_code == 404
    api.force_authenticate(users["admin"])
    assert api.get(f"/api/v1/choirs/{other.pk}/calendar/").data["calendar"] == "maronite"


def test_overrides_preview_precedence_and_saved_mass_unchanged(setup):
    api, users, choir = setup
    api.force_authenticate(users["planner"])
    season = LiturgicalSeason.objects.create(name="Choir feast", slug="m6-feast")
    mass = Mass.objects.create(
        choir=choir,
        date="2026-11-01",
        title="Keep saved season",
        liturgical_season=season,
        created_by=users["planner"],
        updated_by=users["planner"],
    )
    url = f"/api/v1/choirs/{choir.pk}/calendar/"
    assert (
        api.patch(
            url, {"calendar": "manual", "time_zone": "Asia/Beirut", "version": 0}, format="json"
        ).status_code
        == 200
    )
    r = api.post(
        url + "overrides/",
        {"date": "2026-11-01", "season_id": season.pk, "version": 1},
        format="json",
    )
    assert r.status_code == 200
    headers = {"HTTP_X_CHOIR_ID": str(choir.pk)}
    assert (
        api.get("/api/v1/calendar/maronite/?date=2026-11-01", **headers).data["source"]
        == "override"
    )
    assert (
        api.get("/api/v1/calendar/maronite/?date=2026-11-02", **headers).data["source"] == "manual"
    )
    assert (
        api.post(
            url + "overrides/",
            {"date": "2026-11-01", "season_id": None, "version": 1},
            format="json",
        ).status_code
        == 409
    )
    assert (
        api.post(
            url + "overrides/",
            {"date": "2026-11-01", "season_id": None, "version": 2},
            format="json",
        ).status_code
        == 200
    )
    mass.refresh_from_db()
    assert mass.date == date(2026, 11, 1) and mass.liturgical_season_id == season.pk
    season.is_active = False
    season.save()
    assert (
        api.post(
            url + "overrides/",
            {"date": "2026-11-03", "season_id": season.pk, "version": 3},
            format="json",
        ).status_code
        == 400
    )
    assert (
        api.post(
            url + "overrides/",
            {"date": "1800-01-01", "season_id": None, "version": 3},
            format="json",
        ).status_code
        == 400
    )
    api.force_authenticate(users["outsider"])
    assert api.get("/api/v1/calendar/maronite/?date=2026-11-01", **headers).status_code == 404


def test_inactive_override_requires_manual_selection_and_timezone_date_boundaries(setup):
    from choirs.calendar_settings import default_mass_date
    from masses.selectors import mass_list

    api, users, choir = setup
    season = LiturgicalSeason.objects.create(name="Old feast", slug="old-feast", is_active=False)
    CalendarSettings.objects.create(choir=choir, time_zone="Pacific/Honolulu")
    CalendarOverride.objects.create(choir=choir, date="2026-11-01", season=season)
    api.force_authenticate(users["member"])
    result = api.get("/api/v1/calendar/maronite/?date=2026-11-01", HTTP_X_CHOIR_ID=str(choir.pk))
    assert result.data["source"] == "override" and result.data["season_id"] is None
    mass = Mass.objects.create(
        choir=choir,
        date="2026-11-01",
        title="Boundary Mass",
        created_by=users["planner"],
        updated_by=users["planner"],
    )
    with patch("django.utils.timezone.now", return_value=datetime(2026, 11, 2, 1, tzinfo=UTC)):
        assert default_mass_date("Pacific/Honolulu") == "2026-11-01"
        assert mass_list(QueryDict("archived=false"), choir.pk).filter(pk=mass.pk).exists()
