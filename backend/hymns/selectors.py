"""Strict literal filters and bounded, prefetched reads without join duplication."""

import re

from django.contrib.postgres.aggregates import StringAgg
from django.db.models import (
    BooleanField,
    Case,
    CharField,
    Exists,
    ExpressionWrapper,
    F,
    OuterRef,
    Q,
    QuerySet,
    Subquery,
    Value,
    When,
)
from django.db.models.expressions import RawSQL
from django.db.models.functions import Lower
from rest_framework import serializers
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination

from hymns.models import CATEGORY_TYPES, Hymn
from hymns.usage import finalized_occurrences, with_usage

FILTER_TYPES = {
    "genres": CATEGORY_TYPES["genres"],
    "seasons": CATEGORY_TYPES["liturgical-seasons"],
    "placements": CATEGORY_TYPES["mass-placements"],
    "languages": CATEGORY_TYPES["languages"],
    "tags": CATEGORY_TYPES["tags"],
}
COLUMN_ORDERINGS = [
    name
    for column in ("title", "language", "seasons", "genres", "tags", "key", "duration", "voices")
    for name in (column, f"-{column}")
]
LIBRARY_ORDERINGS = [
    *COLUMN_ORDERINGS,
    "newest_added",
    "recently_used",
    "least_recently_used",
    "most_used",
    "least_used",
]
USAGE_PARAMS = {"used_after", "used_before", "not_used_since", "never_used"}


def validate_query(params, allowed: set[str]) -> None:
    """Reject unknown/repeated parameters; never silently ignore a copied URL."""
    errors = {}
    for name in params:
        if name not in allowed:
            errors[name] = ["Unknown query parameter."]
        elif len(params.getlist(name)) != 1:
            errors[name] = ["Supply this parameter only once."]
    if errors:
        raise ValidationError(errors)


def active_filter(queryset, value: str):
    if value not in {"true", "false", "all"}:
        raise ValidationError({"is_active": ["Use true, false, or all."]})
    return queryset if value == "all" else queryset.filter(is_active=value == "true")


def hymn_queryset() -> QuerySet:
    """Use one language join and four prefetches for both list and detail."""
    return with_usage(
        Hymn.objects.select_related("language").prefetch_related(
            "genres", "seasons", "placements", "tags"
        )
    )


def library_queryset(params) -> QuerySet:
    """AND dimensions, OR IDs within each; neutral does not broaden season matches."""
    validate_query(
        params,
        {
            *FILTER_TYPES,
            *USAGE_PARAMS,
            "q",
            "is_active",
            "ordering",
            "page",
            "page_size",
            "preferred_season",
        },
    )
    rows = active_filter(hymn_queryset(), params.get("is_active", "true"))
    for name, model in FILTER_TYPES.items():
        if name not in params:
            continue
        value = params[name]
        if not re.fullmatch(r"[1-9]\d*(,[1-9]\d*)*", value):
            raise ValidationError({name: ["Supply comma-separated positive category IDs."]})
        ids = {int(item) for item in value.split(",")}
        if model.objects.filter(id__in=ids).count() != len(ids):
            raise ValidationError({name: ["Unknown category ID."]})
        rows = rows.filter(**{"language_id__in" if name == "languages" else f"{name}__id__in": ids})
    text = params.get("q", "").strip()
    if text:
        search = Q()
        for name in (
            "title",
            "alternate_title",
            "first_line",
            "composer",
            "source_or_hymnal",
            "tags__name",
        ):
            search |= Q(**{f"{name}__icontains": text})
        rows = rows.filter(search)
    # Bounds must match ONE finalized occurrence, not independent historical
    # dates and not just the maximum date. Never-used includes future plans.
    dates = {
        key: serializers.DateField().run_validation(params[key])
        for key in ("used_after", "used_before", "not_used_since")
        if key in params
    }
    if (
        "used_after" in dates
        and "used_before" in dates
        and dates["used_after"] > dates["used_before"]
    ):
        raise ValidationError({"used_before": ["End date must be on or after start date."]})
    occurrences = finalized_occurrences().filter(hymn_id=OuterRef("pk"))
    bounded = occurrences
    for key, lookup in (("used_after", "gte"), ("used_before", "lte")):
        if key in dates:
            bounded = bounded.filter(**{f"mass__date__{lookup}": dates[key]})
    if "used_after" in dates or "used_before" in dates:
        rows = rows.filter(Exists(bounded))
    if "not_used_since" in dates:
        rows = rows.filter(~Exists(occurrences.filter(mass__date__gte=dates["not_used_since"])))
    if "never_used" in params:
        if params["never_used"] not in {"true", "false"}:
            raise ValidationError({"never_used": ["Use true or false."]})
        rows = (
            rows.filter(usage_count=0)
            if params["never_used"] == "true"
            else rows.filter(usage_count__gt=0)
        )
    ordering = params.get("ordering", "title")
    orders = {
        "title": [Lower("title"), "id"],
        "newest_added": ["-created_at", "-id"],
        "recently_used": [F("last_used_date").desc(nulls_last=True), Lower("title"), "id"],
        "least_recently_used": [F("last_used_date").asc(nulls_first=True), Lower("title"), "id"],
        "most_used": ["-usage_count", Lower("title"), "id"],
        "least_used": ["usage_count", Lower("title"), "id"],
    }
    column_fields = {
        "title": Lower("title"),
        "language": Lower("language__name"),
        "key": Lower("default_key"),
        "duration": F("estimated_duration_minutes"),
    }
    column = ordering.removeprefix("-")
    if column == "voices":
        # JSONB's native comparison prioritizes array length. Sort the displayed
        # voice text instead, retaining its saved order; empty parts sort last.
        # This constant scalar SQL references only this queryset's root table.
        rows = rows.annotate(
            _column_label=RawSQL(
                "(SELECT string_agg(lower(part.value), ', ' ORDER BY part.ordinality) "
                'FROM jsonb_array_elements_text("hymns_hymn"."voices") '
                "WITH ORDINALITY AS part(value, ordinality))",
                [],
                output_field=CharField(),
            )
        )
        column_fields[column] = F("_column_label")
    if column in {"genres", "tags", "seasons"}:
        # Aggregate in an isolated subquery: no N+1 or multi-relation row inflation.
        relation = Hymn._meta.get_field(column)
        linked = relation.remote_field.model._meta.model_name
        labels = (
            relation.remote_field.through.objects.filter(hymn_id=OuterRef("pk"))
            .order_by()
            .values("hymn_id")
            .annotate(
                label=StringAgg(
                    Lower(f"{linked}__name"),
                    delimiter=", ",
                    order_by=Lower(f"{linked}__name"),
                )
            )
            .values("label")
        )
        expression = Subquery(labels, output_field=CharField())
        if column == "seasons":
            expression = Case(
                When(is_season_neutral=True, then=Value("any season")),
                default=expression,
                output_field=CharField(),
            )
        rows = rows.annotate(_column_label=expression)
        column_fields[column] = F("_column_label")
    if column in column_fields:
        expression = column_fields[column]
        orders[ordering] = [
            expression.desc(nulls_last=True)
            if ordering.startswith("-")
            else expression.asc(nulls_last=True),
            Lower("title"),
            "id",
        ]
    if ordering not in orders:
        raise ValidationError({"ordering": [f"Choose one of: {', '.join(LIBRARY_ORDERINGS)}."]})
    rows = rows.order_by(*orders[ordering])
    if "preferred_season" in params:
        value = params["preferred_season"]
        if (
            not re.fullmatch(r"[1-9]\d*", value)
            or not CATEGORY_TYPES["liturgical-seasons"].objects.filter(pk=value).exists()
        ):
            raise ValidationError({"preferred_season": ["Supply one existing positive season ID."]})
        # A subquery avoids multiplying rows for multi-season hymns. Preference
        # changes ordering only; literal season filtering above stays unchanged.
        matching_ids = Hymn.objects.filter(seasons=value).values("pk")
        rows = rows.annotate(
            _season_preferred=ExpressionWrapper(
                Q(is_season_neutral=True) | Q(pk__in=matching_ids), output_field=BooleanField()
            )
        ).order_by("-_season_preferred", *rows.query.order_by)
    return rows.distinct()


class LibraryPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"

    def paginate_queryset(self, queryset, request, view=None):
        for name in ("page", "page_size"):
            if name in request.query_params and not re.fullmatch(
                r"[1-9]\d*", request.query_params[name]
            ):
                raise ValidationError({name: ["Use a positive integer."]})
        if request.query_params.get("page_size", "25") not in {"25", "50", "100"}:
            raise ValidationError({"page_size": ["Choose 25, 50, or 100."]})
        return super().paginate_queryset(queryset, request, view)
