"""Strict literal filters and bounded, prefetched reads without join duplication."""

import re

from django.db.models import BooleanField, ExpressionWrapper, Q, QuerySet
from django.db.models.functions import Lower
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination

from hymns.models import CATEGORY_TYPES, Hymn

FILTER_TYPES = {
    "genres": CATEGORY_TYPES["genres"],
    "seasons": CATEGORY_TYPES["liturgical-seasons"],
    "placements": CATEGORY_TYPES["mass-placements"],
    "languages": CATEGORY_TYPES["languages"],
    "tags": CATEGORY_TYPES["tags"],
}
USAGE_PARAMS = {"used_after", "used_before", "not_used_since", "never_used"}


def validate_query(params, allowed: set[str]) -> None:
    """Reject unknown/repeated parameters; never silently ignore a copied URL."""
    errors = {}
    for name in params:
        if name not in allowed:
            errors[name] = [
                "This filter is unavailable until M4."
                if name in USAGE_PARAMS
                else "Unknown query parameter."
            ]
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
    return Hymn.objects.select_related("language").prefetch_related(
        "genres", "seasons", "placements", "tags"
    )


def library_queryset(params) -> QuerySet:
    """AND dimensions, OR IDs within each; neutral does not broaden season matches."""
    validate_query(
        params,
        {*FILTER_TYPES, "q", "is_active", "ordering", "page", "page_size", "preferred_season"},
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
    ordering = params.get("ordering", "title")
    if ordering == "title":
        rows = rows.order_by(Lower("title"), "id")
    elif ordering == "newest_added":
        rows = rows.order_by("-created_at", "-id")
    else:
        raise ValidationError(
            {"ordering": ["Use title or newest_added; usage sorting arrives in M4."]}
        )
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
