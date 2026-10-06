"""Atomic, permission-checked library mutations shared by HTTP and Django admin.

Lock owners first, then categories in fixed type/ID order. Active-state and
delete operations use the same locks, so new links cannot race deactivation.
Retained inactive links are permitted; author attribution is never ownership.
"""

from uuid import uuid4

from django.db import IntegrityError, models, transaction
from django.db.models.deletion import ProtectedError
from django.db.models.functions import Lower, Trim
from django.utils.text import slugify
from rest_framework.exceptions import APIException, NotFound, PermissionDenied, ValidationError

from accounts.permissions import Role, role_for
from hymns.models import CATEGORY_TYPES, RELATIONS, Hymn
from hymns.uploads import pdf_upload_path


class ReferencedRecord(APIException):
    status_code = 409
    default_code = "referenced_record"
    default_detail = "This record is referenced. Deactivate it to preserve existing links."


def require_role(actor, minimum: Role) -> None:
    """Reject unauthenticated/insufficient actors, including direct service callers."""
    allowed = {Role.ADMIN} if minimum == Role.ADMIN else {Role.ADMIN, Role.PLANNER}
    if not actor.is_authenticated or not actor.is_active or role_for(actor) not in allowed:
        raise PermissionDenied("Your account cannot make this change.")


def reference_counts(category) -> dict[str, int]:
    """Count direct incoming relations (not usage); future FK relations are included."""
    return {
        relation.get_accessor_name(): getattr(category, relation.get_accessor_name()).count()
        for relation in category._meta.related_objects
    }


def locked_record(model: type[models.Model], pk: int):
    try:
        return model.objects.select_for_update().get(pk=pk)
    except model.DoesNotExist as error:
        raise NotFound("This record no longer exists.") from error


@transaction.atomic
def save_category(model: type[models.Model], data: dict, actor, pk: int | None = None):
    """Create/update a category with an immutable slug; owns its transaction.

    Unique-name/slug conflicts are handled inside savepoints. Seeds use their
    stable slugs separately; ordinary creation retries actual slug collisions.
    """
    require_role(actor, Role.ADMIN)
    instance = locked_record(model, pk) if pk is not None else model()
    for name, value in data.items():
        setattr(instance, name, value)
    base = slugify(instance.name)[:150] or "category"
    for attempt in range(5):
        if pk is None:
            instance.slug = base if attempt == 0 else f"{base}-{uuid4().hex[:12]}"
        try:
            with transaction.atomic():
                instance.save()
            return instance
        except IntegrityError as error:
            duplicate = model.objects.annotate(normalized=Lower(Trim("name"))).filter(
                normalized=instance.name.strip().lower()
            )
            if pk is not None:
                duplicate = duplicate.exclude(pk=pk)
            if duplicate.exists():
                raise ValidationError(
                    {"name": ["A category with this name already exists."]}
                ) from error
            if pk is not None or attempt == 4:
                raise


@transaction.atomic
def delete_category(model: type[models.Model], pk: int, actor) -> None:
    """Admin-only delete, rejecting every incoming relation before through-table cascade."""
    require_role(actor, Role.ADMIN)
    instance = locked_record(model, pk)
    if any(reference_counts(instance).values()):
        raise ReferencedRecord()
    try:
        instance.delete()
    except ProtectedError as error:
        raise ReferencedRecord() from error


@transaction.atomic
def reorder_categories(model: type[models.Model], ids: list[int], actor):
    """Lock in ID order; require full membership and commit contiguous display order."""
    require_role(actor, Role.ADMIN)
    rows = list(model.objects.select_for_update().order_by("id"))
    if len(ids) != len(set(ids)) or set(ids) != {row.pk for row in rows}:
        raise ValidationError(
            {"ordered_ids": ["Include every category exactly once, including inactive records."]}
        )
    positions = {pk: position for position, pk in enumerate(ids)}
    for row in rows:
        row.display_order = positions[row.pk]
        row.save(update_fields=["display_order", "updated_at"])
    return sorted(rows, key=lambda row: row.display_order)


def save_hymn(data: dict, actor, pk: int | None = None) -> Hymn:
    """Atomically validate/save metadata and relationships; owns its transaction.

    Caller supplies serializer-validated data. Recheck permissions and relation
    state under locks; PATCH omissions retain old values. Newly stored files are
    removed on failure; replaced files are deleted only after database commit.
    File storage itself is not transactional, so unexpected outer-transaction
    rollback/process termination may leave an unreferenced file for later cleanup.
    """
    stored_files = []
    try:
        with transaction.atomic():
            return _save_hymn(data, actor, pk, stored_files)
    except Exception:
        for storage, name in stored_files:
            storage.delete(name)
        raise


def _save_hymn(data, actor, pk, stored_files) -> Hymn:
    """Validate the locked aggregate before writing metadata, relations, or files."""
    require_role(actor, Role.PLANNER)
    hymn = locked_record(Hymn, pk) if pk is not None else Hymn()
    old_pdf = hymn.sheet_music_pdf.name
    old = {
        name: set(getattr(hymn, name).values_list("id", flat=True)) if pk else set()
        for name in RELATIONS
    }
    incoming = {
        name: set(
            data.get(f"{name[:-1]}_ids" if name != "placements" else "placement_ids", old[name])
        )
        for name in RELATIONS
    }
    # "genres"/"seasons"/"tags" use singular write names; no implicit relationship removal.
    language_id = data.get("language_id", hymn.language_id)
    requested = {model: old[name] | incoming[name] for name, model in RELATIONS.items()}
    requested[CATEGORY_TYPES["languages"]] = {
        value for value in (language_id, hymn.language_id) if value
    }
    locked = {}
    for model in CATEGORY_TYPES.values():
        locked[model] = {
            row.pk: row
            for row in model.objects.select_for_update()
            .filter(pk__in=requested[model])
            .order_by("id")
        }
    errors = {}
    language = locked[CATEGORY_TYPES["languages"]].get(language_id)
    if language is None or (not language.is_active and language_id != hymn.language_id):
        errors["language_id"] = [
            "Choose an active language; an existing inactive language may be retained."
        ]
    for name, model in RELATIONS.items():
        field = f"{name[:-1]}_ids"
        invalid = [
            value
            for value in incoming[name]
            if value not in locked[model]
            or (not locked[model][value].is_active and value not in old[name])
        ]
        if invalid:
            errors[field] = ["Unknown or newly inactive category selected."]
    if not incoming["placements"]:
        errors["placement_ids"] = ["Choose at least one placement."]
    elif incoming["placements"] != old["placements"] and not any(
        locked[RELATIONS["placements"]].get(value)
        and locked[RELATIONS["placements"]][value].is_active
        for value in incoming["placements"]
    ):
        errors["placement_ids"] = [
            "A changed placement set requires at least one active placement."
        ]
    if not data.get("is_season_neutral", hymn.is_season_neutral) and not incoming["seasons"]:
        errors["season_ids"] = ["Choose a season or mark this hymn season-neutral."]
    if not data.get("is_polyphonic", hymn.is_polyphonic) and data.get("voices", hymn.voices):
        errors["voices"] = ["Enable polyphony or explicitly clear the voice list."]
    requested_active = data.get("is_active", hymn.is_active if pk else True)
    if role_for(actor) != Role.ADMIN and requested_active != (hymn.is_active if pk else True):
        raise PermissionDenied("Only an Admin can change a hymn's active state.")
    if errors:
        raise ValidationError(errors)
    for name, value in data.items():
        if not name.endswith("_ids") and name not in {"sheet_music_pdf", "remove_sheet_music_pdf"}:
            setattr(hymn, name, value)
    upload = data.get("sheet_music_pdf")
    storage = hymn.sheet_music_pdf.storage
    if upload:
        name = storage.save(pdf_upload_path(hymn, upload.name), upload)
        stored_files.append((storage, name))
        hymn.sheet_music_pdf.name = name
        hymn.sheet_music_pdf_name = upload.name.replace("\\", "/").rsplit("/", 1)[-1][:255]
    elif data.get("remove_sheet_music_pdf"):
        hymn.sheet_music_pdf = ""
        hymn.sheet_music_pdf_name = ""
    if pk is None:
        hymn.created_by = actor
    hymn.updated_by = actor
    hymn.save()
    for name in RELATIONS:
        getattr(hymn, name).set(incoming[name])
    if old_pdf and old_pdf != hymn.sheet_music_pdf.name:
        transaction.on_commit(lambda: storage.delete(old_pdf), robust=True)
    return hymn


@transaction.atomic
def delete_hymn(pk: int, actor) -> None:
    """Admin-only deletion; future protected selections prevent historical loss."""
    require_role(actor, Role.ADMIN)
    hymn = locked_record(Hymn, pk)
    storage, pdf_name = hymn.sheet_music_pdf.storage, hymn.sheet_music_pdf.name
    try:
        hymn.delete()
    except ProtectedError as error:
        raise ReferencedRecord() from error
    if pdf_name:
        transaction.on_commit(lambda: storage.delete(pdf_name), robust=True)
