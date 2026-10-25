"""Transactional draft writes with one Mass revision and consistent lock order.

Lock Mass, then Hymns by ID, then categories. Validate the entire program
before writes. Live classification changes do not advance a Mass revision.
"""

import re
from collections import defaultdict

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from accounts.permissions import Role
from choirs.access import require_choir
from hymns.models import Hymn, LiturgicalSeason, MassPlacement
from hymns.services import locked_record, require_role
from masses.models import Mass, MassHymnSelection


class RevisionRequired(APIException):
    status_code = 428
    default_code = "revision_required"
    default_detail = "Supply the saved Mass revision before making changes."


class RevisionConflict(APIException):
    status_code = 412
    default_code = "revision_conflict"
    default_detail = "Another planner changed this Mass. Review the saved version before retrying."

    def __init__(self, revision: int):
        self.current_revision = revision
        super().__init__()


class MassFinalized(APIException):
    status_code = 409
    default_code = "mass_finalized"
    default_detail = "This Mass is finalized and cannot be edited."


def checked_mass(
    pk: int, actor, expected: str | None, minimum: Role = Role.PLANNER, *, draft_only: bool = True
) -> Mass:
    """Require a transaction; authorize before parsing, then check revision/state."""
    if minimum == Role.ADMIN:
        require_role(actor, minimum)
    mass = locked_record(Mass, pk)
    require_choir(actor, mass.choir_id, planner=True, lock=True)
    if expected is None:
        raise RevisionRequired()
    if not re.fullmatch(r"[1-9][0-9]*", expected) or len(expected) > 19:
        raise ValidationError({"revision": ["Supply a positive integer revision header."]})
    if int(expected) != mass.revision:
        raise RevisionConflict(mass.revision)
    if draft_only and mass.status != "draft":
        raise MassFinalized()
    return mass


def advance(mass: Mass, actor) -> None:
    """Persist one effective aggregate change with authorship and a new revision."""
    mass.revision += 1
    mass.updated_by = actor
    mass.save()


@transaction.atomic
def save_mass(data: dict, actor, pk: int | None = None, expected: str | None = None) -> Mass:
    """Create/update draft metadata; serializer-valid input, owns its transaction.

    Retain an unchanged inactive season, reject new inactive links. Identical
    metadata is a no-op. Blank titles regenerate the date-based default.
    """
    if pk is None:
        require_choir(actor, data.get("choir_id"), planner=True, lock=True)
    mass = (
        checked_mass(pk, actor, expected)
        if pk is not None
        else Mass(created_by=actor, updated_by=actor, choir_id=data["choir_id"])
    )
    season_id = data.get("liturgical_season_id", mass.liturgical_season_id)
    if season_id:
        season = LiturgicalSeason.objects.select_for_update().filter(pk=season_id).first()
        if season is None or (not season.is_active and season_id != mass.liturgical_season_id):
            raise ValidationError(
                {"liturgical_season_id": ["Choose an active season or retain the saved season."]}
            )
    values = dict(data)
    if pk is not None and "choir_id" in values:
        raise ValidationError({"choir": ["A Mass cannot be transferred between choirs."]})
    if pk is None or "title" in values:
        values["title"] = (
            values.get("title")
            or f"Sunday Mass — {values.get('date', mass.date).strftime('%B %d, %Y')}"
        )
    changed = any(getattr(mass, field) != value for field, value in values.items())
    for field, value in values.items():
        setattr(mass, field, value)
    if pk is None:
        mass.save()
    elif changed:
        advance(mass, actor)
    return mass


@transaction.atomic
def save_program(pk: int, rows: list[dict], actor, expected: str | None) -> Mass:
    """Atomically replace a draft's rows, retaining supplied identity and order.

    Requires Planner/Admin and current revision. Locks hymn/placement references
    against concurrent deactivation/deletion. New links must be active; retaining
    an inactive row requires its ID and unchanged hymn AND placement. Positions
    must be contiguous per placement. Validation failures leave everything intact.
    """
    mass = checked_mass(pk, actor, expected)
    old = {row.pk: row for row in mass.selections.all()}
    hymns = {
        row.pk: row
        for row in Hymn.objects.select_for_update()
        .filter(pk__in={row["hymn_id"] for row in rows})
        .order_by("id")
    }
    placements = {
        row.pk: row
        for row in MassPlacement.objects.select_for_update()
        .filter(pk__in={row["placement_id"] for row in rows})
        .order_by("id")
    }
    errors, seen, positions = {}, set(), defaultdict(list)
    for index, row in enumerate(rows):
        row_errors = {}
        previous = old.get(row.get("id"))
        if "id" in row and (previous is None or row["id"] in seen):
            row_errors["id"] = ["Use each selection ID from this Mass at most once."]
        seen.add(row.get("id"))
        retained = (
            previous
            and previous.hymn_id == row["hymn_id"]
            and previous.placement_id == row["placement_id"]
        )
        for field, records in (("hymn_id", hymns), ("placement_id", placements)):
            record = records.get(row[field])
            if record is None or (not record.is_active and not retained):
                row_errors[field] = [
                    "Unknown or newly inactive selection. Retain inactive rows by their saved identity."
                ]
        positions[row["placement_id"]].append(row["position"])
        if row_errors:
            errors[index] = row_errors
    if errors:
        raise ValidationError({"selections": errors})
    if any(sorted(values) != list(range(len(values))) for values in positions.values()):
        raise ValidationError(
            {
                "selections": [
                    "Positions must be distinct and contiguous from zero within each placement."
                ]
            }
        )
    removed = set(old) - {row["id"] for row in rows if "id" in row}
    changed = bool(removed)
    mass.selections.filter(pk__in=removed).delete()
    for row in rows:
        values = {
            field: row.get(field) for field in ("hymn_id", "placement_id", "position", "notes")
        }
        previous = old.get(row.get("id"))
        if previous is None:
            MassHymnSelection.objects.create(mass=mass, **values)
            changed = True
        elif any(getattr(previous, field) != value for field, value in values.items()):
            for field, value in values.items():
                setattr(previous, field, value)
            previous.save()
            changed = True
    if changed:
        advance(mass, actor)
    return mass


@transaction.atomic
def delete_mass(pk: int, actor, expected: str | None) -> None:
    """Admin-only deletion of any saved Mass; usage follows its removed selections."""
    checked_mass(pk, actor, expected, Role.ADMIN, draft_only=False).delete()


@transaction.atomic
def transition_mass(pk: int, actor, expected: str | None, *, reopen: bool = False) -> Mass:
    """Lock the same aggregate as saves; authorize, check revision, then transition.

    Current-state repeats preserve timestamp/revision. Stale repeats still fail.
    Selection identities/order/notes never change. Usage is derived from status,
    so the transaction exposes both the lifecycle and history change together.
    """
    mass = checked_mass(pk, actor, expected, Role.PLANNER, draft_only=False)
    target = "draft" if reopen else "finalized"
    if mass.status != target:
        mass.status = target
        mass.finalized_at = None if reopen else timezone.now()
        advance(mass, actor)
    return mass
