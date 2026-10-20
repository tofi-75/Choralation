"""Read-only random suggestions for the caller's current, possibly unsaved draft.

Match active hymns to active placements using the explicit selected season (or
season-neutral classification). Randomize candidate order, then find a maximum
matching so a flexible hymn cannot unnecessarily leave another placement empty.
Suggestions do not reserve hymns or write a Mass: the normal revision-guarded
program save remains the only insertion path.
"""

from random import SystemRandom

from django.db.models import Q
from rest_framework.exceptions import ValidationError

from hymns.models import Hymn, LiturgicalSeason, MassPlacement
from hymns.selectors import hymn_queryset


def random_picks(season_id: int, placement_ids: list[int], excluded_hymn_ids: list[int]) -> dict:
    """Use the whole eligible library, without repeats or library-page bias.

    A retained inactive season can still describe a draft. New placements must
    be active. Excluded IDs need not still exist; they only remove candidates.
    Maximum matching prioritizes coverage, not a uniformly sampled assignment.
    """
    if not LiturgicalSeason.objects.filter(pk=season_id).exists():
        raise ValidationError({"season_id": ["Choose an existing season."]})
    placements = list(MassPlacement.objects.filter(pk__in=placement_ids, is_active=True))
    if len(placements) != len(placement_ids):
        raise ValidationError({"placement_ids": ["Choose distinct active placements."]})

    eligible = (
        Hymn.objects.filter(is_active=True, placements__in=placement_ids)
        .filter(Q(is_season_neutral=True) | Q(seasons=season_id) | Q(seasons__slug="ordinary-time"))
        .exclude(pk__in=excluded_hymn_ids)
        .values_list("pk", "placements__pk")
        .distinct()
    )
    candidates = {pk: [] for pk in placement_ids}
    for hymn_id, placement_id in eligible:
        if placement_id in candidates:
            candidates[placement_id].append(hymn_id)
    rng = SystemRandom()
    order = list(placement_ids)
    rng.shuffle(order)
    for options in candidates.values():
        rng.shuffle(options)
    owners: dict[int, int] = {}

    def assign(placement_id: int, seen: set[int]) -> bool:
        # Re-route a previous match when that frees its hymn for a constrained slot.
        for hymn_id in candidates[placement_id]:
            if hymn_id in seen:
                continue
            seen.add(hymn_id)
            if hymn_id not in owners or assign(owners[hymn_id], seen):
                owners[hymn_id] = placement_id
                return True
        return False

    for placement_id in order:
        assign(placement_id, set())
    matches = {placement_id: hymn_id for hymn_id, placement_id in owners.items()}
    hymns = {hymn.pk: hymn for hymn in hymn_queryset().filter(pk__in=owners)}
    return {
        "picks": [
            {"placement_id": pk, "hymn": hymns[matches[pk]]}
            for pk in placement_ids
            if pk in matches
        ],
        "unfilled_placement_ids": [pk for pk in placement_ids if pk not in matches],
    }
