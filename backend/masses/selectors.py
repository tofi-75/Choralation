"""Bounded Mass lists, prefetched live programs, and soft suitability warnings."""

from collections import defaultdict

from django.db.models import BooleanField, Case, Count, DateField, F, Prefetch, Q, QuerySet, When
from django.http import QueryDict
from django.utils import timezone
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from hymns.models import LiturgicalSeason
from hymns.selectors import hymn_queryset, validate_query
from masses.models import Mass, MassHymnSelection


def mass_queryset() -> QuerySet[Mass]:
    """Read all rows, including inactive saved hymns and placements, without N+1."""
    return Mass.objects.select_related("liturgical_season").prefetch_related(
        Prefetch(
            "selections",
            queryset=MassHymnSelection.objects.select_related("placement").prefetch_related(
                Prefetch("hymn", queryset=hymn_queryset())
            ),
        )
    )


def mass_list(params: QueryDict) -> QuerySet[Mass]:
    """Inclusive date bounds, literal season/status, search, deterministic pagination."""
    validate_query(params, {"from", "to", "status", "season", "q", "archived", "page", "page_size"})
    rows = Mass.objects.select_related("liturgical_season").annotate(
        selection_count=Count("selections")
    )
    dates = {}
    for key in ("from", "to"):
        if key in params:
            dates[key] = serializers.DateField().run_validation(params[key])
    if "from" in dates and "to" in dates and dates["from"] > dates["to"]:
        raise ValidationError({"to": ["End date must be on or after start date."]})
    for key, value in dates.items():
        rows = rows.filter(**{f"date__{'gte' if key == 'from' else 'lte'}": value})
    if "status" in params:
        if params["status"] not in {"draft", "finalized"}:
            raise ValidationError({"status": ["Use draft or finalized."]})
        rows = rows.filter(status=params["status"])
    if "season" in params:
        pk = serializers.IntegerField(min_value=1).run_validation(params["season"])
        if not LiturgicalSeason.objects.filter(pk=pk).exists():
            raise ValidationError({"season": ["Unknown season ID."]})
        rows = rows.filter(liturgical_season_id=pk)
    text = params.get("q", "").strip()
    if text:
        rows = rows.filter(Q(title__icontains=text) | Q(notes__icontains=text))
    # Evaluate one team-local day for the whole request. Archive is a date-based
    # list grouping, never a persisted lifecycle state or a write to old drafts.
    today = timezone.localdate()
    if "archived" in params:
        if params["archived"] not in {"true", "false"}:
            raise ValidationError({"archived": ["Use true or false."]})
        rows = (
            rows.filter(date__lt=today)
            if params["archived"] == "true"
            else rows.filter(date__gte=today)
        )
    return rows.annotate(
        is_archived=Case(
            When(date__lt=today, then=True), default=False, output_field=BooleanField()
        ),
        _upcoming_date=Case(When(date__gte=today, then=F("date")), output_field=DateField()),
    ).order_by("is_archived", "_upcoming_date", "-date", "-id")


def program_warnings(mass: Mass) -> list[dict]:
    """Suitability/repetition are advisory; active manual choices remain allowed."""
    warnings = []
    repeated = defaultdict(list)
    for row in mass.selections.all():
        repeated[row.hymn_id].append(row.pk)
        codes = []
        if row.placement_id not in {item.pk for item in row.hymn.placements.all()}:
            codes.append("placement_mismatch")
        if (
            mass.liturgical_season_id
            and not row.hymn.is_season_neutral
            and not any(item.slug == "ordinary-time" for item in row.hymn.seasons.all())
            and bool(row.hymn.seasons.all())
            and mass.liturgical_season_id not in {item.pk for item in row.hymn.seasons.all()}
        ):
            codes.append("season_mismatch")
        if not row.hymn.is_active or not row.placement.is_active:
            codes.append("inactive_selection")
        warnings.extend(
            {
                "code": code,
                "hymn_id": row.hymn_id,
                "selection_ids": [row.pk],
                "placement_id": row.placement_id,
                "facts": {},
            }
            for code in codes
        )
    warnings.extend(
        {
            "code": "duplicate_hymn",
            "hymn_id": pk,
            "selection_ids": ids,
            "facts": {"occurrences": len(ids)},
        }
        for pk, ids in repeated.items()
        if len(ids) > 1
    )
    return warnings


def mass_history(params: QueryDict) -> QuerySet[Mass]:
    """Same literal filters as planning, newest first, with prefetched previews."""
    return (
        mass_list(params)
        .prefetch_related(
            Prefetch(
                "selections", queryset=MassHymnSelection.objects.select_related("hymn", "placement")
            )
        )
        .order_by("-date", "-id")
    )


def hymn_usage(pk: int, params: QueryDict) -> QuerySet[MassHymnSelection]:
    """Finalized occurrences only; date bounds constrain each occurrence's Mass."""
    validate_query(params, {"from", "to", "season", "q", "page", "page_size"})
    return (
        MassHymnSelection.objects.filter(
            hymn_id=pk, mass__status="finalized", mass_id__in=mass_list(params).values("pk")
        )
        .select_related("mass", "placement")
        .order_by(
            "-mass__date", "-mass_id", "placement__display_order", "placement_id", "position", "id"
        )
    )
