"""Random suggestions respect eligibility, maximize coverage, and never persist drafts."""

import pytest
from choir_fixtures import choir_client, choir_member, legacy_choir
from django.contrib.auth.models import Group

from hymns.models import Hymn, Language, LiturgicalSeason, MassPlacement
from masses.models import Mass, MassHymnSelection

pytestmark = pytest.mark.django_db


@pytest.fixture
def picking(django_user_model):
    user = django_user_model.objects.create_user(username="random-planner")
    user.groups.add(Group.objects.get(name="Planner"))
    choir_member(user)
    api = choir_client()
    api.force_authenticate(user)
    season = LiturgicalSeason.objects.create(name="Random season", slug="random")
    other = LiturgicalSeason.objects.create(name="Other random season", slug="other-random")
    language = Language.objects.create(name="Random language", slug="random")
    placements = [
        MassPlacement.objects.create(name=f"Random placement {i}", slug=f"random-{i}")
        for i in range(3)
    ]
    mass = Mass.objects.create(
        choir=legacy_choir(),
        date="2026-10-11",
        title="Random test Mass",
        liturgical_season=season,
        created_by=user,
    )

    def hymn(title, slots, *, neutral=False, active=True, season_value=season):
        value = Hymn.objects.create(
            title=title, language=language, is_season_neutral=neutral, is_active=active
        )
        value.placements.set(slots)
        if season_value:
            value.seasons.add(season_value)
        return value

    def pick(**overrides):
        body = {
            "season_id": season.pk,
            "placement_ids": [p.pk for p in placements],
            "excluded_hymn_ids": [],
            **overrides,
        }
        return api.post(f"/api/v1/masses/{mass.pk}/random-picks/", body, format="json")

    return api, user, season, other, placements, mass, hymn, pick


def test_eligible_season_or_neutral_active_correct_placement_and_no_writes(picking):
    _, _, _, other, slots, mass, hymn, pick = picking
    matching = hymn("Matching", [slots[0]])
    neutral = hymn("Neutral", [slots[1]], neutral=True, season_value=None)
    hymn("Wrong season", [slots[2]], season_value=other)
    hymn("Unclassified", [slots[2]], season_value=None)
    hymn("Inactive", [slots[2]], active=False)
    before = (mass.revision, mass.updated_at)
    response = pick()
    assert response.status_code == 200, response.data
    assert [(row["placement_id"], row["hymn"]["id"]) for row in response.data["picks"]] == [
        (slots[0].pk, matching.pk),
        (slots[1].pk, neutral.pk),
    ]
    assert response.data["unfilled_placement_ids"] == [slots[2].pk]
    assert response.data["picks"][0]["hymn"]["placements"][0]["id"] == slots[0].pk
    mass.refresh_from_db()
    assert (mass.revision, mass.updated_at) == before
    assert not MassHymnSelection.objects.filter(mass=mass).exists()
    assert response["Cache-Control"] == "no-store"


def test_maximum_coverage_reroutes_flexible_hymn_without_duplicates(picking, monkeypatch):
    _, _, _, _, slots, _, hymn, pick = picking
    # Force the tempting shared choice first; a greedy one-pass picker would miss a slot.
    monkeypatch.setattr(
        "masses.random_picker.SystemRandom.shuffle", lambda _, values: values.sort()
    )
    shared = hymn("Shared", slots[:2])
    exclusive = hymn("Exclusive", slots[:1])
    response = pick()
    assert response.status_code == 200
    matches = {row["placement_id"]: row["hymn"]["id"] for row in response.data["picks"]}
    assert matches == {slots[0].pk: exclusive.pk, slots[1].pk: shared.pk}
    assert response.data["unfilled_placement_ids"] == [slots[2].pk]


def test_excludes_existing_choices_and_considers_candidates_beyond_first_library_page(picking):
    _, _, _, _, slots, mass, hymn, pick = picking
    existing = hymn("Existing", slots)
    selection = MassHymnSelection.objects.create(
        mass=mass, hymn=existing, placement=slots[0], position=0, notes="Keep this"
    )
    # More than the maximum library page: only the last candidate remains eligible.
    excluded = [existing.pk] + [hymn(f"Candidate {i}", slots[1:2]).pk for i in range(101)]
    available = hymn("Last candidate", slots[1:2])
    response = pick(placement_ids=[slots[1].pk], excluded_hymn_ids=excluded)
    assert [row["hymn"]["id"] for row in response.data["picks"]] == [available.pk]
    selection.refresh_from_db()
    assert selection.notes == "Keep this" and selection.hymn_id == existing.pk


def test_empty_pool_returns_all_requested_placements_unfilled(picking):
    *_, slots, _, _, pick = picking
    response = pick()
    assert response.status_code == 200
    assert response.data == {"picks": [], "unfilled_placement_ids": [p.pk for p in slots]}


@pytest.mark.parametrize(
    "field,value",
    [
        ("season_id", None),
        ("season_id", 999999),
        ("placement_ids", []),
        ("placement_ids", [999999]),
        ("excluded_hymn_ids", [-1]),
        ("unexpected", True),
    ],
)
def test_invalid_context_is_rejected_without_writes(picking, field, value):
    *_, mass, _, pick = picking
    assert pick(**{field: value}).status_code == 400
    mass.refresh_from_db()
    assert mass.revision == 1


def test_duplicate_or_inactive_placements_are_rejected(picking):
    *_, slots, _, _, pick = picking
    assert pick(placement_ids=[slots[0].pk, slots[0].pk]).status_code == 400
    slots[0].is_active = False
    slots[0].save()
    assert pick(placement_ids=[slots[0].pk]).status_code == 400


def test_planner_admin_only_and_finalized_mass_rejected(picking):
    api, user, _, _, _, mass, _, pick = picking
    api.force_authenticate(None)
    assert pick().status_code == 403
    api.force_authenticate(user)
    user.groups.set([Group.objects.get(name="Viewer")])
    choir_member(user)
    assert pick().status_code == 403
    user.groups.set([Group.objects.get(name="Admin")])
    assert pick().status_code == 200
    mass.status = "finalized"
    mass.save()
    assert pick().status_code == 409


def test_explicit_unsaved_season_overrides_saved_mass_context(picking):
    _, _, _, other, slots, _, hymn, pick = picking
    available = hymn("New season", slots[:1], season_value=other)
    assert pick().data["picks"] == []
    response = pick(season_id=other.pk)
    assert [row["hymn"]["id"] for row in response.data["picks"]] == [available.pk]
