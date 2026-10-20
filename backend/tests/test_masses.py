"""M3 persistence/permissions: atomic replacement, identity, revision and references."""

from datetime import UTC, date, datetime, timedelta

import pytest
from django.contrib.auth.models import Group
from django.test import RequestFactory
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied
from rest_framework.test import APIClient

from hymns.models import Hymn, Language, LiturgicalSeason, MassPlacement
from hymns.services import reference_counts
from masses.admin import PlanningInspectionAdmin
from masses.models import Mass, MassHymnSelection
from masses.services import save_mass, save_program

pytestmark = pytest.mark.django_db


@pytest.fixture
def planning(django_user_model):
    users = {}
    for role in ("Admin", "Planner", "Viewer"):
        user = django_user_model.objects.create_user(username=f"mass-{role.lower()}")
        user.groups.add(Group.objects.get(name=role))
        users[role] = user
    language = Language.objects.create(name="Mass language", slug="mass")
    season = LiturgicalSeason.objects.create(name="Mass season", slug="mass")
    placement = MassPlacement.objects.create(name="Mass placement", slug="mass")
    hymns = []
    for title in ("First hymn", "Second hymn"):
        hymn = Hymn.objects.create(title=title, language=language)
        hymn.placements.add(placement)
        hymn.seasons.add(season)
        hymns.append(hymn)
    api = APIClient()
    api.force_authenticate(users["Planner"])
    created = api.post(
        "/api/v1/masses/", {"date": "2026-10-07", "liturgical_season_id": season.pk}, format="json"
    )
    assert created.status_code == 201, created.data
    return api, users, season, placement, hymns, created.data


def put(api, mass, rows, revision=None):
    return api.put(
        f"/api/v1/masses/{mass['id']}/program/",
        {"selections": rows},
        format="json",
        HTTP_X_EXPECTED_MASS_REVISION=str(revision if revision is not None else mass["revision"]),
    )


def row(placement, hymn, position=0, **extra):
    return {"placement_id": placement.pk, "hymn_id": hymn.pk, "position": position, **extra}


def test_metadata_default_title_manual_season_non_sunday_and_noop(planning):
    api, users, season, _, _, mass = planning
    assert mass["status"] == "draft" and mass["revision"] == 1
    assert mass["title"] == "Sunday Mass — October 07, 2026"
    assert mass["program"] == [] and mass["finalized_at"] is None
    assert mass["liturgical_season"]["id"] == season.pk
    changed = api.patch(
        f"/api/v1/masses/{mass['id']}/",
        {"title": "ܩܠܐ", "notes": "Line one\nLine two"},
        format="json",
        HTTP_X_EXPECTED_MASS_REVISION="1",
    )
    assert changed.status_code == 200 and changed["X-Mass-Revision"] == "2"
    repeated = api.patch(
        f"/api/v1/masses/{mass['id']}/",
        {"title": "ܩܠܐ", "notes": "Line one\nLine two"},
        format="json",
        HTTP_X_EXPECTED_MASS_REVISION="2",
    )
    assert repeated.data["revision"] == 2
    assert repeated.data["updated_by"] == users["Planner"].pk
    assert repeated["Cache-Control"] == "no-store"


@pytest.mark.parametrize(
    "header,status", [(None, 428), ("*", 400), ("0", 400), ("1,2", 400), ("999", 412)]
)
def test_revision_preconditions_preserve_metadata(planning, header, status):
    api, _, _, _, _, mass = planning
    kwargs = {} if header is None else {"HTTP_X_EXPECTED_MASS_REVISION": header}
    response = api.patch(
        f"/api/v1/masses/{mass['id']}/", {"title": "Overwrite"}, format="json", **kwargs
    )
    assert response.status_code == status
    assert Mass.objects.get(pk=mass["id"]).revision == 1
    if status == 412:
        assert response["X-Mass-Revision"] == "1" and response.data["current_revision"] == 1


def test_full_program_identity_reorder_remove_notes_noop(planning):
    api, _, _, placement, hymns, mass = planning
    saved = put(api, mass, [row(placement, hymns[0]), row(placement, hymns[1], 1, notes="Second")])
    assert saved.status_code == 200 and saved.data["revision"] == 2
    first, second = saved.data["selections"]
    rows = [
        row(placement, hymns[1], 0, id=second["id"], notes="Moved"),
        row(placement, hymns[0], 1, id=first["id"]),
    ]
    reordered = put(api, mass, rows, 2)
    assert reordered.status_code == 200, reordered.data
    assert [item["id"] for item in reordered.data["selections"]] == [second["id"], first["id"]]
    assert put(api, mass, rows, 3).data["revision"] == 3
    removed = put(api, mass, rows[:1], 3)
    assert removed.status_code == 200 and removed.data["revision"] == 4
    detail = api.get(f"/api/v1/masses/{mass['id']}/")
    assert detail.data["selection_count"] == 1
    assert detail.data["program"][0]["notes"] == "Moved"
    assert not MassHymnSelection.objects.filter(pk=first["id"]).exists()


@pytest.mark.parametrize(
    "defect",
    ["unknown-hymn", "gap", "duplicate-position", "foreign-id", "duplicate-id", "unknown-field"],
)
def test_invalid_full_payload_is_atomic(planning, defect):
    api, _, _, placement, hymns, mass = planning
    saved = put(api, mass, [row(placement, hymns[0])]).data
    original = saved["selections"][0]
    rows = [
        row(placement, hymns[0], id=original["id"], notes="Must not save"),
        row(placement, hymns[1], 1),
    ]
    if defect == "unknown-hymn":
        rows[1]["hymn_id"] = 999999
    if defect == "gap":
        rows[1]["position"] = 2
    if defect == "duplicate-position":
        rows[1]["position"] = 0
    if defect == "foreign-id":
        other = Mass.objects.create(date="2026-10-09", title="Other")
        foreign = MassHymnSelection.objects.create(
            mass=other, hymn=hymns[1], placement=placement, position=0
        )
        rows[1]["id"] = foreign.pk
    if defect == "duplicate-id":
        rows[1]["id"] = original["id"]
    if defect == "unknown-field":
        rows[1]["usage_count"] = 1
    response = put(api, mass, rows, 2)
    assert response.status_code == 400, response.data
    detail = api.get(f"/api/v1/masses/{mass['id']}/").data
    assert detail["revision"] == 2 and detail["program"] == saved["selections"]


def test_inactive_retention_identity_and_new_placement_validation(planning):
    api, _, _, placement, hymns, mass = planning
    saved = put(api, mass, [row(placement, hymns[0])]).data
    hymn = hymns[0]
    hymn.is_active = False
    hymn.save()
    placement.is_active = False
    placement.save()
    retained = row(placement, hymn, id=saved["selections"][0]["id"], notes="Retained")
    response = put(api, mass, [retained], 2)
    assert response.status_code == 200
    assert response.data["warnings"][0]["code"] == "inactive_selection"
    assert put(api, mass, [row(placement, hymn)], 3).status_code == 400
    other = MassPlacement.objects.create(name="Other placement", slug="other")
    retained["placement_id"] = other.pk
    assert put(api, mass, [retained], 3).status_code == 400


def test_inactive_season_retained_and_protected_references(planning):
    api, users, season, placement, hymns, mass = planning
    season.is_active = False
    season.save()
    assert (
        api.patch(
            f"/api/v1/masses/{mass['id']}/",
            {"notes": "Keep season"},
            format="json",
            HTTP_X_EXPECTED_MASS_REVISION="1",
        ).status_code
        == 200
    )
    assert (
        api.post(
            "/api/v1/masses/",
            {"date": "2026-10-08", "liturgical_season_id": season.pk},
            format="json",
        ).status_code
        == 400
    )
    saved = put(api, mass, [row(placement, hymns[0])], 2)
    assert saved.status_code == 200
    api.force_authenticate(users["Admin"])
    assert api.delete(f"/api/v1/hymns/{hymns[0].pk}/").status_code == 409
    assert api.delete(f"/api/v1/mass-placements/{placement.pk}/").status_code == 409
    assert api.delete(f"/api/v1/liturgical-seasons/{season.pk}/").status_code == 409
    assert reference_counts(season)["masses"] == 1


def test_duplicate_and_suitability_are_advisory(planning):
    api, _, _, placement, hymns, mass = planning
    hymns[0].placements.clear()
    hymns[0].seasons.set(
        [LiturgicalSeason.objects.create(name="Different season", slug="different")]
    )
    response = put(api, mass, [row(placement, hymns[0]), row(placement, hymns[0], 1)])
    assert response.status_code == 200
    assert {item["code"] for item in response.data["warnings"]} == {
        "duplicate_hymn",
        "placement_mismatch",
        "season_mismatch",
    }


def test_permissions_deletion_finalized_and_admin_inspection(planning):
    api, users, _, placement, hymns, mass = planning
    api.force_authenticate(users["Viewer"])
    assert api.get(f"/api/v1/masses/{mass['id']}/").status_code == 200
    assert api.post("/api/v1/masses/", {"date": "2026-10-07"}, format="json").status_code == 403
    assert put(api, mass, []).status_code == 403
    with pytest.raises(PermissionDenied):
        save_program(mass["id"], [], users["Viewer"], "1")
    with pytest.raises(PermissionDenied):
        save_mass({"notes": "No"}, users["Viewer"], mass["id"], "1")
    api.force_authenticate(users["Planner"])
    assert (
        api.delete(f"/api/v1/masses/{mass['id']}/", HTTP_X_EXPECTED_MASS_REVISION="1").status_code
        == 403
    )
    put(api, mass, [row(placement, hymns[0])])
    Mass.objects.filter(pk=mass["id"]).update(status="finalized")
    assert put(api, mass, [], 2).status_code == 409
    assert put(api, mass, [], 1).status_code == 412
    api.force_authenticate(users["Admin"])
    assert (
        api.delete(f"/api/v1/masses/{mass['id']}/", HTTP_X_EXPECTED_MASS_REVISION="2").status_code
        == 204
    )
    assert not MassHymnSelection.objects.exists() and Hymn.objects.count() == 2
    request = RequestFactory().get("/")
    request.user = users["Admin"]
    admin = PlanningInspectionAdmin(Mass, None)
    assert admin.has_view_permission(request)
    assert not any(
        (
            admin.has_add_permission(request),
            admin.has_change_permission(request),
            admin.has_delete_permission(request),
        )
    )


def test_list_filters_and_unknown_queries(planning):
    api, _, season, _, _, mass = planning
    assert (
        api.get(
            "/api/v1/masses/",
            {
                "from": "2026-10-07",
                "to": "2026-10-07",
                "season": season.pk,
                "status": "draft",
                "q": "October",
            },
        ).data["count"]
        == 1
    )

    assert api.get("/api/v1/masses/", {"from": "2026-10-08"}).data["count"] == 0
    for query in (
        {"from": "bad"},
        {"from": "2026-10-08", "to": "2026-10-07"},
        {"status": "bad"},
        {"season": "999999"},
        {"unknown": "value"},
        {"page_size": "500"},
    ):
        assert api.get("/api/v1/masses/", query).status_code == 400
    assert api.get("/api/v1/masses/?q=a&q=b").status_code == 400
    assert (
        api.post(
            "/api/v1/masses/", {"date": "2026-10-07", "status": "finalized"}, format="json"
        ).status_code
        == 400
    )


def test_list_nearest_upcoming_then_archived_uses_team_midnight(planning, monkeypatch):
    api, _, _, _, _, saved = planning
    # Oct 8 UTC is already Oct 9 in Beirut. "Today" must use the team day.
    monkeypatch.setattr(timezone, "now", lambda: datetime(2026, 10, 8, 22, 30, tzinfo=UTC))
    records = {}
    for title, day in [
        ("far", "2026-11-01"),
        ("yesterday", "2026-10-08"),
        ("today", "2026-10-09"),
        ("near", "2026-10-11"),
        ("today second", "2026-10-09"),
    ]:
        records[title] = Mass.objects.create(title=f"Sorted {title}", date=day)
    with timezone.override("Asia/Beirut"):
        response = api.get("/api/v1/masses/", {"q": "Sorted"})
    assert response.status_code == 200
    rows = response.data["results"]
    assert [row["id"] for row in rows] == [
        records[title].pk for title in ("today second", "today", "near", "far", "yesterday")
    ]
    assert [row["is_archived"] for row in rows] == [False, False, False, False, True]
    assert all(row["status"] == "draft" and row["revision"] == 1 for row in rows)
    records["yesterday"].refresh_from_db()
    assert records["yesterday"].status == "draft" and records["yesterday"].revision == 1
    assert api.get(f"/api/v1/masses/{saved['id']}/").status_code == 200


def test_list_global_order_spans_pages_and_archive_filters(planning, monkeypatch):
    api, _, _, _, _, saved = planning
    today = date(2026, 10, 8)
    monkeypatch.setattr("masses.selectors.timezone.localdate", lambda: today)
    for offset in range(1, 27):
        Mass.objects.create(title=f"Upcoming {offset}", date=today + timedelta(days=offset))
    first = api.get("/api/v1/masses/").data
    second = api.get("/api/v1/masses/?page=2").data
    assert first["count"] == 27 and len(first["results"]) == 25
    assert [row["title"] for row in first["results"]] == [
        f"Upcoming {offset}" for offset in range(1, 26)
    ]
    assert all(not row["is_archived"] for row in first["results"])
    assert [row["is_archived"] for row in second["results"]] == [False, True]
    assert second["results"][1]["id"] == saved["id"]
    old = Mass.objects.create(title="Older archive", date="2026-10-01")
    archived = api.get("/api/v1/masses/?to=2026-10-07").data["results"]
    assert [row["id"] for row in archived] == [saved["id"], old.pk]
    assert all(row["is_archived"] for row in archived)


@pytest.mark.parametrize("neutral, classified", [(True, True), (True, False), (False, False)])
def test_any_season_or_unspecified_season_has_no_mismatch_notice(planning, neutral, classified):
    api, _, _, placement, hymns, mass = planning
    hymn = hymns[0]
    hymn.is_season_neutral = neutral
    hymn.save()
    hymn.seasons.set(
        [LiturgicalSeason.objects.create(name="Different", slug="different")] if classified else []
    )
    saved = put(api, mass, [row(placement, hymn)])
    assert saved.status_code == 200, saved.data
    assert not any(item["code"] == "season_mismatch" for item in saved.data["warnings"])
    detail = api.get(f"/api/v1/masses/{mass['id']}/").data
    assert not any(item["code"] == "season_mismatch" for item in detail["warnings"])


def test_archived_filter_is_applied_before_pagination_using_team_day(planning):
    api, _, _, _, _, _ = planning
    today = timezone.localdate()
    Mass.objects.all().delete()
    for offset in range(-30, 31):
        Mass.objects.create(
            date=today + timedelta(days=offset), title=str(offset), status="finalized"
        )
    upcoming = api.get("/api/v1/masses/?status=finalized&archived=false").data
    assert upcoming["count"] == 31 and len(upcoming["results"]) == 25
    assert [item["date"] for item in upcoming["results"]] == [
        (today + timedelta(days=offset)).isoformat() for offset in range(25)
    ]
    archived = api.get("/api/v1/masses/history/?status=finalized&archived=true").data
    assert archived["count"] == 30
    assert all(item["is_archived"] for item in archived["results"])
    assert api.get("/api/v1/masses/?archived=invalid").status_code == 400


def test_ordinary_time_hymns_are_suitable_preferred_and_random_eligible(planning):
    api, _, season, placement, hymns, mass = planning
    ordinary, _ = LiturgicalSeason.objects.get_or_create(
        slug="ordinary-time", defaults={"name": "Ordinary Time"}
    )
    hymns[0].seasons.set([ordinary])
    saved = put(api, mass, [row(placement, hymns[0])])
    assert not any(w["code"] == "season_mismatch" for w in saved.data["warnings"])
    detail = api.get(f"/api/v1/masses/{mass['id']}/").data
    assert not any(w["code"] == "season_mismatch" for w in detail["warnings"])
    picks = api.post(
        f"/api/v1/masses/{mass['id']}/random-picks/",
        {
            "season_id": season.pk,
            "placement_ids": [placement.pk],
            "excluded_hymn_ids": [hymns[1].pk],
        },
        format="json",
    )
    assert picks.status_code == 200
    assert picks.data["picks"][0]["hymn"]["id"] == hymns[0].pk
    # A universal hymn sorts with season matches ahead of unrelated seasons.
    hymns[1].seasons.clear()
    titles = api.get(f"/api/v1/hymns/?preferred_season={season.pk}&ordering=title").data["results"]
    assert titles[0]["id"] == hymns[0].pk
