"""Finalized occurrence queries shared by library statistics and hymn history.

Each selection counts once, including repeated hymns in a single Mass. Correlated
subqueries isolate usage from the library's many-to-many classification joins.
Global statistics intentionally include future finalized dates (scheduled use).
"""

from django.db.models import Count, IntegerField, Max, OuterRef, QuerySet, Subquery, Value
from django.db.models.functions import Coalesce

from masses.models import MassHymnSelection


def finalized_occurrences(choir_id=None) -> QuerySet[MassHymnSelection]:
    """Global history includes future finalized programs, never drafts."""
    return MassHymnSelection.objects.filter(mass__status="finalized", mass__choir_id=choir_id)


def with_usage(rows: QuerySet, choir_id=None) -> QuerySet:
    """Add zero/null for never-used hymns with no per-record queries."""
    totals = (
        finalized_occurrences(choir_id)
        .filter(hymn_id=OuterRef("pk"))
        .order_by()
        .values("hymn_id")
        .annotate(total=Count("pk"), last=Max("mass__date"))
    )
    return rows.annotate(
        usage_count=Coalesce(
            Subquery(totals.values("total")), Value(0), output_field=IntegerField()
        ),
        last_used_date=Subquery(totals.values("last")),
    )
