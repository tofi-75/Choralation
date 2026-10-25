"""M4: lifecycle, literal occurrence filters, repeat counts and saved history."""

import pytest
from choir_fixtures import legacy_choir
from django.db import connection
from django.test.utils import CaptureQueriesContext
from test_masses import planning as planning_fixture
from test_masses import put, row

from hymns.models import Genre, Hymn, Tag
from masses.models import Mass, MassHymnSelection
from masses.services import MassFinalized, save_mass, save_program

planning = planning_fixture
pytestmark = pytest.mark.django_db


def action(api, mass, name, revision, data=None):
    return api.post(
        f"/api/v1/masses/{mass['id']}/{name}/",
        data or {},
        format="json",
        HTTP_X_EXPECTED_MASS_REVISION=str(revision),
    )


def test_lifecycle_repeat_reopen_and_occurrence_identity(planning):
    api, users, _, placement, hymns, mass = planning
    saved = put(
        api,
        mass,
        [row(placement, hymns[0], 0, notes="First"), row(placement, hymns[0], 1, notes="Second")],
    ).data
    original = list(MassHymnSelection.objects.values_list("id", "position", "notes"))

    def detail():
        return api.get(f"/api/v1/hymns/{hymns[0].pk}/").data

    assert detail()["usage_count"] == 0
    finalized = action(api, mass, "finalize", saved["revision"])
    assert finalized.status_code == 200, finalized.data
    assert finalized.data["revision"] == 3 and finalized.data["finalized_at"]
    assert finalized["X-Mass-Revision"] == "3"
    assert detail()["usage_count"] == 2 and detail()["last_used_date"] == mass["date"]
    repeated = action(api, mass, "finalize", 3)
    assert repeated.data["revision"] == 3
    assert repeated.data["finalized_at"] == finalized.data["finalized_at"]
    assert action(api, mass, "finalize", 2).status_code == 412
    reopened = action(api, mass, "reopen", 3)
    assert reopened.data["revision"] == 4 and reopened.data["finalized_at"] is None
    assert detail()["usage_count"] == 0
    assert api.get(f"/api/v1/hymns/{hymns[0].pk}/usage/").data["count"] == 0
    assert action(api, mass, "reopen", 4).data["revision"] == 4
    assert action(api, mass, "finalize", 4).data["revision"] == 5
    assert detail()["usage_count"] == 2
    assert list(MassHymnSelection.objects.values_list("id", "position", "notes")) == original


def test_finalized_write_guards_permissions_and_empty_program(planning):
    api, users, _, _, _, mass = planning
    for name in ("finalize", "reopen"):
        api.force_authenticate(users["Viewer"])
        assert (
            api.post(f"/api/v1/masses/{mass['id']}/{name}/", {}, format="json").status_code == 403
        )
    api.force_authenticate(users["Planner"])
    assert api.post(f"/api/v1/masses/{mass['id']}/finalize/", {}, format="json").status_code == 428
    assert action(api, mass, "finalize", "bad").status_code == 400
    assert action(api, mass, "finalize", 1, {"status": "finalized"}).status_code == 400
    assert action(api, mass, "finalize", 1).status_code == 200  # empty remains optional
    assert put(api, mass, [], revision=2).status_code == 409
    assert (
        api.patch(
            f"/api/v1/masses/{mass['id']}/",
            {"title": "Change"},
            format="json",
            HTTP_X_EXPECTED_MASS_REVISION="2",
        ).status_code
        == 409
    )
    assert action(api, mass, "finalize", 1)["X-Mass-Revision"] == "2"
    for call in (
        lambda: save_mass({"title": "No"}, users["Admin"], mass["id"], "2"),
        lambda: save_program(mass["id"], [], users["Admin"], "2"),
    ):
        with pytest.raises(MassFinalized):
            call()


@pytest.fixture
def usage(planning):
    api, users, season, placement, hymns, mass = planning
    a, b = hymns
    never = Hymn.objects.create(title="A never", language=a.language, is_season_neutral=True)
    never.placements.add(placement)
    # Two categories/tags and repeated title stress joined filtering and stable ties.
    for title in ("Extra 1", "Extra 2"):
        genre = Genre.objects.create(name=title, slug=title.replace(" ", "-").lower())
        tag = Tag.objects.create(name=title, slug=title.replace(" ", "-").lower())
        a.genres.add(genre)
        a.tags.add(tag)
    records = []
    for day, hymn, times, state in [
        ("2026-01-04", a, 2, "finalized"),
        ("2026-05-03", a, 1, "finalized"),
        ("2026-03-01", b, 1, "finalized"),
        ("2026-10-07", b, 1, "draft"),
    ]:
        record = Mass.objects.create(
            choir=legacy_choir(),
            date=day,
            title=f"Usage {day}",
            liturgical_season=season,
            status=state,
        )
        for index in range(times):
            MassHymnSelection.objects.create(
                mass=record, hymn=hymn, placement=placement, position=index, notes=f"Note {index}"
            )
        records.append(record)
    return api, users, placement, a, b, never, records


def test_usage_aggregates_joins_and_filtered_occurrences(usage):
    api, _, _, a, b, never, _ = usage
    response = api.get(
        "/api/v1/hymns/",
        {
            "q": "Extra",
            "genres": ",".join(map(str, a.genres.values_list("id", flat=True))),
            "tags": ",".join(map(str, a.tags.values_list("id", flat=True))),
        },
    )
    assert response.status_code == 200, response.data
    assert response.data["count"] == 1
    assert response.data["results"][0]["usage_count"] == 3
    assert response.data["results"][0]["last_used_date"] == "2026-05-03"

    def ids(**params):
        return {r["id"] for r in api.get("/api/v1/hymns/", params).data["results"]}

    assert ids(used_after="2026-02-01", used_before="2026-04-01") == {b.pk}
    assert ids(used_after="2026-01-04", used_before="2026-01-04") == {a.pk}
    assert ids(not_used_since="2026-04-01") == {b.pk, never.pk}
    assert ids(never_used="true") == {never.pk}
    assert ids(never_used="false") == {a.pk, b.pk}
    assert ids(never_used="true", used_after="2026-01-01") == set()


@pytest.mark.parametrize(
    "ordering,expected",
    [
        ("recently_used", ["a", "b", "never"]),
        ("least_recently_used", ["never", "b", "a"]),
        ("most_used", ["a", "b", "never"]),
        ("least_used", ["never", "b", "a"]),
    ],
)
def test_usage_sorting_and_never_used_placement(usage, ordering, expected):
    api, _, _, a, b, never, _ = usage
    records = {"a": a, "b": b, "never": never}
    response = api.get("/api/v1/hymns/", {"ordering": ordering})
    assert response.status_code == 200, response.data
    assert [r["id"] for r in response.data["results"]] == [records[key].pk for key in expected]


@pytest.mark.parametrize(
    "query",
    [
        "used_after=bad",
        "used_before=bad",
        "not_used_since=bad",
        "never_used=maybe",
        "used_after=2026-05-01&used_before=2026-01-01",
        "never_used=true&never_used=false",
    ],
)
def test_invalid_usage_queries(planning, query):
    assert planning[0].get(f"/api/v1/hymns/?{query}").status_code == 400


def test_hymn_history_retains_inactive_rows_and_mass_history_preview(usage):
    api, users, placement, a, _, _, records = usage
    api.force_authenticate(users["Viewer"])
    a.is_active = False
    a.save()
    placement.is_active = False
    placement.save()
    history = api.get(f"/api/v1/hymns/{a.pk}/usage/")
    assert history.status_code == 200, history.data
    rows = history.data["results"]
    assert history.data["count"] == 3 and [r["mass"]["date"] for r in rows] == [
        "2026-05-03",
        "2026-01-04",
        "2026-01-04",
    ]
    assert [r["position"] for r in rows] == [0, 0, 1]
    assert all(not r["placement"]["is_active"] for r in rows)
    assert rows[-1]["notes"] == "Note 1"
    assert api.get(f"/api/v1/hymns/{a.pk}/usage/?from=2026-01-04&to=2026-01-04").data["count"] == 2
    assert api.get(f"/api/v1/hymns/{a.pk}/usage/?status=draft").status_code == 400
    assert api.get("/api/v1/hymns/999999/usage/").status_code == 404
    with CaptureQueriesContext(connection) as captured:
        masses = api.get("/api/v1/masses/history/?status=finalized&q=Usage")
    assert len(captured) <= 10  # bounded verification/membership checks plus fixed prefetches
    assert masses.status_code == 200, masses.data
    assert [r["id"] for r in masses.data["results"]] == [
        records[1].pk,
        records[2].pk,
        records[0].pk,
    ]
    assert len(masses.data["results"][-1]["preview"]) == 2
    assert api.get("/api/v1/masses/history/?status=draft&q=Usage").data["count"] == 1


@pytest.mark.parametrize("role", ["Planner", "Admin", "Viewer"])
def test_finalized_edit_and_deletion_role_guards_and_usage(planning, role):
    api, users, _, placement, hymns, mass = planning
    saved = put(api, mass, [row(placement, hymns[0])]).data
    finalized = action(api, mass, "finalize", saved["revision"]).data
    api.force_authenticate(users[role])
    if role == "Viewer":
        assert action(api, mass, "reopen", finalized["revision"]).status_code == 403
    else:
        reopened = action(api, mass, "reopen", finalized["revision"])
        assert reopened.status_code == 200 and reopened.data["status"] == "draft"
        assert api.get(f"/api/v1/hymns/{hymns[0].pk}/").data["usage_count"] == 0
        finalized = action(api, mass, "finalize", reopened.data["revision"]).data
    deleted = api.delete(
        f"/api/v1/masses/{mass['id']}/", HTTP_X_EXPECTED_MASS_REVISION=str(finalized["revision"])
    )
    assert deleted.status_code == (204 if role == "Admin" else 403)
    if role == "Admin":
        assert not Mass.objects.filter(pk=mass["id"]).exists()
        assert Hymn.objects.filter(pk=hymns[0].pk).exists()
        assert api.get(f"/api/v1/hymns/{hymns[0].pk}/").data["usage_count"] == 0


def test_finalized_deletion_checks_revision_before_removal(planning):
    api, users, _, placement, hymns, mass = planning
    saved = put(api, mass, [row(placement, hymns[0])]).data
    finalized = action(api, mass, "finalize", saved["revision"]).data
    api.force_authenticate(users["Admin"])
    assert (
        api.delete(
            f"/api/v1/masses/{mass['id']}/",
            HTTP_X_EXPECTED_MASS_REVISION=str(finalized["revision"] - 1),
        ).status_code
        == 412
    )
    assert MassHymnSelection.objects.filter(mass_id=mass["id"]).count() == 1
