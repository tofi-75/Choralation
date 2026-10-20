"""M2 acceptance against PostgreSQL: literal search, integrity, API and admin policy."""

from io import StringIO

import pytest
from django.contrib.auth.models import Group
from django.core.management import call_command
from django.db import IntegrityError, connection, transaction
from django.test import Client, override_settings
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIClient

from hymns import selectors
from hymns.admin import HymnForm
from hymns.models import CATEGORY_TYPES, Genre, Hymn, Language, LiturgicalSeason, MassPlacement, Tag

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize("ordering", [*selectors.COLUMN_ORDERINGS, "newest_added"])
def test_picker_season_preference_before_pagination_and_with_section_filter(library, ordering):
    api, _, categories, payload = library
    season = categories["liturgical-seasons"]
    placement = categories["mass-placements"]
    other = LiturgicalSeason.objects.create(name="Picker other season", slug="picker-other")
    wrong_slot = MassPlacement.objects.create(name="Picker other placement", slug="picker-other")
    preferred = []
    for title, neutral, target, target_season in [
        ("ZZ matching", False, placement, season),
        ("ZZ neutral", True, placement, None),
        ("AA wrong section", True, wrong_slot, None),
        *[(f"AA other season {i:02}", False, placement, other) for i in range(26)],
    ]:
        hymn = Hymn.objects.create(
            title=title, language=categories["languages"], is_season_neutral=neutral
        )
        hymn.placements.add(target)
        if target_season:
            hymn.seasons.add(target_season)
        if title.startswith("ZZ"):
            preferred.append(hymn.pk)
    url = (
        f"/api/v1/hymns/?placements={placement.pk}&preferred_season={season.pk}&ordering={ordering}"
    )
    first = api.get(url)
    assert first.status_code == 200, first.data
    assert first.data["count"] == 28
    assert {row["id"] for row in first.data["results"][:2]} == set(preferred)
    assert len({row["id"] for row in first.data["results"]}) == 25
    assert all(row["placements"][0]["id"] == placement.pk for row in first.data["results"])
    second = api.get(url + "&page=2")
    assert len(second.data["results"]) == 3
    assert not set(preferred) & {row["id"] for row in second.data["results"]}
    # Preference does not broaden a literal season filter or defeat text search.
    literal = api.get(url + f"&seasons={season.pk}")
    assert [row["title"] for row in literal.data["results"]] == ["ZZ matching"]
    searched = api.get(url + "&q=other%20season")
    assert searched.data["count"] == 26


@pytest.mark.parametrize("value", ["", "0", "-1", "abc", "999999", "1,2", "1&preferred_season=2"])
def test_picker_season_preference_rejects_invalid_or_repeated_ids(library, value):
    api, *_ = library
    assert api.get(f"/api/v1/hymns/?preferred_season={value}").status_code == 400


@pytest.fixture
def library(django_user_model):
    users = {}
    for role in ("Admin", "Planner", "Viewer"):
        user = django_user_model.objects.create_user(username=role.lower())
        user.groups.add(Group.objects.get(name=role))
        users[role] = user
    categories = {}
    for kind, model in CATEGORY_TYPES.items():
        categories[kind] = model.objects.create(name=f"Test {kind}", slug=f"test-{kind}")
    api = APIClient()
    api.force_authenticate(users["Planner"])
    payload = {
        "title": "ترنيمة القيامة",
        "language_id": categories["languages"].pk,
        "genre_ids": [categories["genres"].pk],
        "season_ids": [categories["liturgical-seasons"].pk],
        "placement_ids": [categories["mass-placements"].pk],
        "tag_ids": [categories["tags"].pk],
    }
    return api, users, categories, payload


def create(api, payload):
    response = api.post("/api/v1/hymns/", payload, format="json")
    assert response.status_code == 201, response.data
    return response.data


def test_complete_metadata_unicode_duplicate_titles_and_attribution(library):
    api, users, categories, payload = library
    payload.update(
        {
            "latin_title": "Tarnimet al qiyama",
            "lyrics": "يا رب\nيا نور",
            "tempo": "Andante · 80 BPM",
            "alternate_title": "ܩܠܐ",
            "first_line": "Test first line",
            "composer": "Composer",
            "arranger": "Arranger",
            "notes": "Line one\nLine two",
            "source_or_hymnal": "Source",
            "hymnal_number": "A-12",
            "default_key": "D minor",
            "estimated_duration_minutes": "3.50",
            "audio_url": "https://example.com/audio",
            "sheet_music_url": "https://example.com/score",
        }
    )
    first, second = create(api, payload), create(api, payload)
    assert first["id"] != second["id"]
    assert first["created_by"] == users["Planner"].pk
    assert first["notes"] == "Line one\nLine two"
    assert first["alternate_title"] == "ܩܠܐ"
    assert first["estimated_duration_minutes"] == "3.50"
    assert first["placements"][0]["id"] == categories["mass-placements"].pk
    assert first["usage_count"] == 0 and first["last_used_date"] is None
    read = api.get(f"/api/v1/hymns/{first['id']}/").data
    for field in payload:
        if not field.endswith(("_id", "_ids")):
            assert read[field] == payload[field]


@pytest.mark.parametrize(
    "changes,field",
    [
        ({"title": "  "}, "title"),
        ({"language_id": None}, "language_id"),
        ({"placement_ids": []}, "placement_ids"),
        ({"season_ids": []}, "season_ids"),
        ({"estimated_duration_minutes": "0"}, "estimated_duration_minutes"),
        ({"estimated_duration_minutes": "-1"}, "estimated_duration_minutes"),
        ({"audio_url": "ftp://example.com/song"}, "audio_url"),
        ({"sheet_music_url": "javascript:alert(1)"}, "sheet_music_url"),
        ({"placement_ids": [999999]}, "placement_ids"),
        ({"created_by": 1}, "created_by"),
        ({"usage_count": 0}, "usage_count"),
    ],
)
def test_invalid_writes_are_field_errors_and_atomic(library, changes, field):
    api, _, _, payload = library
    response = api.post("/api/v1/hymns/", {**payload, **changes}, format="json")
    assert response.status_code == 400
    assert field in response.data["errors"]
    assert Hymn.objects.count() == 0


def test_patch_preserves_omissions_and_normalizes_optional_blanks(library):
    api, _, _, payload = library
    first = create(api, payload)
    response = api.patch(
        f"/api/v1/hymns/{first['id']}/",
        {"title": " Changed ", "audio_url": " ", "notes": ""},
        format="json",
    )
    assert response.status_code == 200, response.data
    assert response.data["title"] == "Changed"
    assert response.data["audio_url"] is None and response.data["notes"] is None
    assert response.data["placements"] == first["placements"]
    rejected = api.patch(
        f"/api/v1/hymns/{first['id']}/",
        {"title": "Must roll back", "season_ids": []},
        format="json",
    )
    assert rejected.status_code == 400
    assert api.get(f"/api/v1/hymns/{first['id']}/").data["title"] == "Changed"


def test_inactive_retention_new_links_and_changed_placement_set(library):
    api, users, categories, payload = library
    first = create(api, payload)
    for category in categories.values():
        category.is_active = False
        category.save()
    retained = api.patch(f"/api/v1/hymns/{first['id']}/", {"notes": "Retained"}, format="json")
    assert retained.status_code == 200
    new = api.post("/api/v1/hymns/", payload, format="json")
    assert new.status_code == 400
    other = MassPlacement.objects.create(
        name="Inactive other", slug="inactive-other", is_active=False
    )
    rejected = api.patch(
        f"/api/v1/hymns/{first['id']}/", {"placement_ids": [other.pk]}, format="json"
    )
    assert rejected.status_code == 400
    assert (
        api.get(f"/api/v1/hymns/{first['id']}/").data["placements"][0]["id"]
        == categories["mass-placements"].pk
    )


def test_role_matrix_active_state_and_csrf(library):
    api, users, _, payload = library
    first = create(api, payload)
    url = f"/api/v1/hymns/{first['id']}/"
    assert api.patch(url, {"is_active": False}, format="json").status_code == 403
    assert api.delete(url).status_code == 403
    api.force_authenticate(users["Viewer"])
    assert api.get(url).status_code == 200
    assert api.post("/api/v1/hymns/", payload, format="json").status_code == 403
    assert api.patch(url, {"notes": "Forbidden"}, format="json").status_code == 403
    api.force_authenticate(users["Admin"])
    assert api.patch(url, {"is_active": False}, format="json").status_code == 200
    assert api.get("/api/v1/hymns/").data["count"] == 0
    assert api.get("/api/v1/hymns/?is_active=false").data["count"] == 1
    assert api.patch(url, {"is_active": True}, format="json").status_code == 200
    browser = Client(enforce_csrf_checks=True)
    browser.force_login(users["Planner"])
    assert (
        browser.post("/api/v1/hymns/", payload, content_type="application/json").status_code == 403
    )
    token = browser.get("/api/v1/auth/csrf/").json()["csrf_token"]
    assert (
        browser.post(
            "/api/v1/hymns/", payload, content_type="application/json", HTTP_X_CSRFTOKEN=token
        ).status_code
        == 201
    )
    api.force_authenticate(None)
    assert api.get("/api/v1/hymns/").status_code == 403


def test_literal_filters_or_languages_search_without_join_duplicates(library):
    api, _, categories, payload = library
    first = create(
        api,
        {
            **payload,
            "alternate_title": "Mary alternative",
            "first_line": "Invocation",
            "composer": "Author",
            "source_or_hymnal": "Book",
        },
    )
    neutral = create(
        api, {**payload, "title": "Neutral", "season_ids": [], "is_season_neutral": True}
    )
    french = Language.objects.create(name="French", slug="french")
    comparison = create(api, {**payload, "title": "French match", "language_id": french.pk})
    tag = Tag.objects.create(name="Mary", slug="mary")
    Hymn.objects.get(pk=first["id"]).tags.add(tag)
    params = {
        "genres": categories["genres"].pk,
        "placements": categories["mass-placements"].pk,
        "seasons": categories["liturgical-seasons"].pk,
        "languages": f"{categories['languages'].pk},{french.pk}",
    }
    results = api.get("/api/v1/hymns/", params).data["results"]
    assert {row["id"] for row in results} == {first["id"], comparison["id"]}
    assert neutral["id"] not in {row["id"] for row in results}
    for text in ("mary", "Invocation", "Author", "Book", "ترنيمة"):
        result = api.get("/api/v1/hymns/", {"q": text}).data
        assert result["count"] == 1
        assert result["results"][0]["id"] == first["id"]


@pytest.mark.parametrize(
    "query",
    [
        "languages=",
        "languages=1,no",
        "genres=999999",
        "page=0",
        "page=last",
        "page_size=10",
        "is_active=maybe",
        "ordering=invalid_usage_order",
        "not_used_since=not-a-date",
        "q=a&q=b",
        "misspelled=1",
    ],
)
def test_bad_queries_are_explicit_errors(library, query):
    api, _, _, _ = library
    response = api.get(f"/api/v1/hymns/?{query}")
    assert response.status_code == 400, response.data
    assert response.data["errors"]


def test_pagination_same_titles_and_query_count(library):
    api, _, _, payload = library
    for _ in range(27):
        create(api, payload)
    with CaptureQueriesContext(connection) as queries:
        page1 = api.get("/api/v1/hymns/").data
    page2 = api.get("/api/v1/hymns/?page=2").data
    assert page1["count"] == 27 and len(page1["results"]) == 25
    assert len(page2["results"]) == 2
    ids = [row["id"] for row in page1["results"] + page2["results"]]
    assert ids == sorted(ids) and len(set(ids)) == 27
    assert len(queries) <= 6, f"Per-row relation queries: {len(queries)}"
    assert api.get("/api/v1/hymns/?page=3").status_code == 404
    assert api.get("/api/v1/hymns/?ordering=newest_added").data["results"][0]["id"] == ids[-1]


@pytest.mark.parametrize("kind", list(CATEGORY_TYPES))
def test_category_crud_unique_names_immutable_slugs_reorder_and_protection(library, kind):
    api, users, categories, payload = library
    seeded_ids = list(
        CATEGORY_TYPES[kind].objects.exclude(pk=categories[kind].pk).values_list("pk", flat=True)
    )
    create(api, payload)
    url = f"/api/v1/{kind}/"
    assert api.post(url, {"name": "Another"}, format="json").status_code == 403
    api.force_authenticate(users["Admin"])
    existing = categories[kind]
    duplicate = api.post(url, {"name": f"  {existing.name.upper()}  "}, format="json")
    assert duplicate.status_code == 400
    created = api.post(url, {"name": "  Another  "}, format="json")
    assert created.status_code == 201, created.data
    pk, slug = created.data["id"], created.data["slug"]
    assert (
        api.patch(f"{url}{pk}/", {"name": "Renamed", "is_active": False}, format="json").data[
            "slug"
        ]
        == slug
    )
    assert api.patch(f"{url}{pk}/", {"slug": "changed"}, format="json").status_code == 400
    assert len(api.get(url).data) == len(seeded_ids) + 1
    assert len(api.get(f"{url}?is_active=all").data) == len(seeded_ids) + 2
    assert api.post(f"{url}reorder/", {"ordered_ids": [pk]}, format="json").status_code == 400
    ordered = api.post(
        f"{url}reorder/", {"ordered_ids": [pk, existing.pk, *seeded_ids]}, format="json"
    )
    assert ordered.status_code == 200
    assert [row["display_order"] for row in ordered.data["results"]] == list(
        range(len(seeded_ids) + 2)
    )
    assert api.get(f"{url}{existing.pk}/").data["reference_counts"]["hymns"] == 1
    protected = api.delete(f"{url}{existing.pk}/")
    assert protected.status_code == 409 and protected.data["code"] == "referenced_record"
    assert api.delete(f"{url}{pk}/").status_code == 204


def test_seed_replay_preserves_edited_records_and_database_constraints():
    call_command("seed_initial_data", stdout=StringIO())
    genre = Genre.objects.get(slug="traditional")
    genre.name, genre.is_active, genre.display_order = "Renamed", False, 91
    genre.save()
    call_command("seed_initial_data", stdout=StringIO())
    genre.refresh_from_db()
    assert (genre.name, genre.is_active, genre.display_order, genre.slug) == (
        "Renamed",
        False,
        91,
        "traditional",
    )
    assert MassPlacement.objects.count() == 11
    for model in CATEGORY_TYPES.values():
        with pytest.raises(IntegrityError), transaction.atomic():
            existing = model.objects.first()
            model.objects.create(name=f" {existing.name.upper()} ", slug="duplicate")
    with pytest.raises(IntegrityError), transaction.atomic():
        Hymn.objects.create(title=" ", language=Language.objects.first())


def test_admin_hymn_form_has_no_unclassified_bypass(library):
    _, _, categories, _ = library
    form = HymnForm(
        data={
            "title": "Admin entry",
            "language": categories["languages"].pk,
            "placements": [categories["mass-placements"].pk],
            "is_active": True,
        }
    )
    assert not form.is_valid()
    assert "seasons" in form.errors


def test_category_slug_collisions_and_unicode_names(library):
    api, users, _, _ = library
    api.force_authenticate(users["Admin"])
    first = api.post("/api/v1/genres/", {"name": "a b"}, format="json").data
    second = api.post("/api/v1/genres/", {"name": "a--b"}, format="json")
    arabic = api.post("/api/v1/genres/", {"name": "تراثي"}, format="json")
    assert second.status_code == arabic.status_code == 201
    assert second.data["slug"] != first["slug"]
    assert arabic.data["slug"].startswith("category")


@override_settings(DEBUG=True)
def test_optional_demo_seed_is_repeatable_and_not_part_of_production_seed(library):
    _, users, _, _ = library
    call_command("seed_initial_data", stdout=StringIO())
    assert Hymn.objects.count() == 0
    for _ in range(2):
        call_command("seed_demo_data", username=users["Admin"].username, stdout=StringIO())
    assert Hymn.objects.count() == 36
    assert all("fictional" in hymn.source_or_hymnal for hymn in Hymn.objects.all())
    for kind, model in CATEGORY_TYPES.items():
        field = {
            "liturgical-seasons": "seasons",
            "mass-placements": "placements",
            "languages": "language",
        }.get(kind, kind)
        assert set(model.objects.filter(is_active=True).values_list("pk", flat=True)) <= set(
            Hymn.objects.values_list(field, flat=True)
        )
    edited = Hymn.objects.first()
    edited.notes = "Keep my demo edits"
    edited.save()
    call_command("seed_demo_data", username=users["Admin"].username, stdout=StringIO())
    edited.refresh_from_db()
    assert edited.notes == "Keep my demo edits"


def test_django_admin_creates_valid_library_records_and_protects_referenced_categories(library):
    _, users, categories, _ = library
    actor = users["Admin"]
    actor.is_staff = actor.is_superuser = True
    actor.save()
    browser = Client()
    browser.force_login(actor)
    created = browser.post(
        "/admin/hymns/genre/add/",
        {
            "name": "Admin category",
            "description": "  ",
            "display_order": 0,
            "is_active": "on",
            "_save": "Save",
        },
    )
    assert created.status_code == 302
    assert Genre.objects.get(name="Admin category").description is None
    response = browser.post(
        "/admin/hymns/hymn/add/",
        {
            "title": "Admin hymn",
            "language": categories["languages"].pk,
            "genres": [categories["genres"].pk],
            "seasons": [categories["liturgical-seasons"].pk],
            "placements": [categories["mass-placements"].pk],
            "is_active": "on",
            "audio_url": "https://example.com/audio",
            "_save": "Save",
        },
    )
    assert response.status_code == 302
    hymn = Hymn.objects.get(title="Admin hymn")
    assert hymn.created_by == actor
    assert list(hymn.placements.values_list("id", flat=True)) == [categories["mass-placements"].pk]
    forbidden = browser.post(
        f"/admin/hymns/genre/{categories['genres'].pk}/delete/", {"post": "yes"}
    )
    assert forbidden.status_code == 403
    assert Genre.objects.filter(pk=categories["genres"].pk).exists()


@pytest.mark.parametrize(
    "column", ["language", "seasons", "genres", "tags", "key", "duration", "voices"]
)
@pytest.mark.parametrize("descending", [False, True])
def test_picker_metadata_column_sort_is_global_and_stable(library, column, descending):
    api, _, categories, _ = library
    lower = Hymn.objects.create(
        title="ZZ lower",
        language=categories["languages"],
        default_key="A",
        estimated_duration_minutes="2",
        voices=["Alto"],
        is_polyphonic=True,
    )
    upper_language = Language.objects.create(name="ZZ upper language", slug="zz-upper")
    upper = Hymn.objects.create(
        title="AA upper",
        language=upper_language,
        default_key="D",
        estimated_duration_minutes="10",
        voices=["Tenor"],
        is_polyphonic=True,
    )
    for name in ("seasons", "genres", "tags"):
        model = Hymn._meta.get_field(name).remote_field.model
        getattr(lower, name).add(model.objects.create(name="AA lower", slug="aa-lower"))
        getattr(upper, name).add(model.objects.create(name="ZZ upper", slug="zz-upper"))
    missing = Hymn.objects.create(title="Missing", language=upper_language)
    ordering = ("-" if descending else "") + column
    response = api.get(f"/api/v1/hymns/?ordering={ordering}")
    assert response.status_code == 200, response.data
    ordered = [
        item["id"] for item in response.data["results"] if item["id"] in (lower.pk, upper.pk)
    ]
    assert ordered == ([upper.pk, lower.pk] if descending else [lower.pk, upper.pk])
    if column in ("seasons", "genres", "tags", "duration"):
        assert response.data["results"][-1]["id"] == missing.pk


def test_picker_sort_aggregates_all_labels_without_duplicate_rows_or_filter_truncation(library):
    api, _, categories, _ = library
    common = Tag.objects.create(name="Zulu", slug="zulu")
    first = Hymn.objects.create(title="ZZ first", language=categories["languages"])
    first.tags.add(common, Tag.objects.create(name="Alpha", slug="alpha"))
    second = Hymn.objects.create(title="AA second", language=categories["languages"])
    second.tags.add(common, Tag.objects.create(name="Beta", slug="beta"))
    for item in (first, second):
        item.genres.add(
            categories["genres"],
            Genre.objects.create(name=f"Genre {item.pk}", slug=f"genre-{item.pk}"),
        )
    response = api.get(
        f"/api/v1/hymns/?tags={common.pk}&genres={categories['genres'].pk}&ordering=tags"
    )
    assert response.status_code == 200, response.data
    assert response.data["count"] == 2
    assert [item["id"] for item in response.data["results"]] == [first.pk, second.pk]


def test_picker_numeric_duration_order_is_applied_before_pagination(library):
    api, _, categories, _ = library
    for minutes in range(28, 0, -1):
        Hymn.objects.create(
            title=f"Reverse {29 - minutes:02}",
            language=categories["languages"],
            estimated_duration_minutes=minutes,
        )
    first = api.get("/api/v1/hymns/?ordering=duration").data
    second = api.get("/api/v1/hymns/?ordering=duration&page=2").data
    assert [float(item["estimated_duration_minutes"]) for item in first["results"]] == list(
        range(1, 26)
    )
    assert [float(item["estimated_duration_minutes"]) for item in second["results"]] == [26, 27, 28]


def test_picker_voice_sort_uses_displayed_text_not_json_array_length(library):
    api, _, categories, _ = library
    solo = Hymn.objects.create(
        title="AA solo", language=categories["languages"], is_polyphonic=True, voices=["Tenor"]
    )
    choir = Hymn.objects.create(
        title="ZZ choir",
        language=categories["languages"],
        is_polyphonic=True,
        voices=["Alto", "Bass", "Tenor"],
    )
    missing = Hymn.objects.create(title="Missing voices", language=categories["languages"])
    for ordering, expected in [
        ("voices", [choir.pk, solo.pk, missing.pk]),
        ("-voices", [solo.pk, choir.pk, missing.pk]),
    ]:
        response = api.get(f"/api/v1/hymns/?ordering={ordering}")
        assert response.status_code == 200, response.data
        assert [item["id"] for item in response.data["results"]] == expected


def test_latin_name_search_preserves_native_title_and_optional_materials(library):
    api, _, _, payload = library
    saved = create(
        api,
        {**payload, "latin_title": "Qamat Maryam", "lyrics": "سطر أول\nسطر ثان", "tempo": "80 BPM"},
    )
    for query in ("qamat", "ترنيمة"):
        response = api.get("/api/v1/hymns/", {"q": query})
        assert response.status_code == 200
        assert [row["id"] for row in response.data["results"]] == [saved["id"]]
    updated = api.patch(
        f"/api/v1/hymns/{saved['id']}/", {"tempo": " ", "latin_title": ""}, format="json"
    )
    assert updated.status_code == 200
    assert updated.data["latin_title"] is None and updated.data["tempo"] is None
    assert updated.data["lyrics"] == saved["lyrics"]
    for field, value in (("latin_title", "a" * 256), ("tempo", "a" * 51)):
        assert (
            api.patch(f"/api/v1/hymns/{saved['id']}/", {field: value}, format="json").status_code
            == 400
        )
