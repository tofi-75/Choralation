"""Group the default seasons and carry existing classifications into their groups."""

from itertools import batched

from django.db import migrations
from django.db.models import F
from django.db.models.functions import Lower, Trim
from django.utils import timezone

SEASONS = (
    ("advent-christmas", "Advent & Christmas", ("birth-of-our-lord", "advent", "christmas")),
    ("epiphany", "Epiphany", ("commemorations",)),
    ("lent", "Lent", ("great-lent",)),
    ("passion", "Passion", ("passion-week", "holy-week")),
    ("resurrection", "Resurrection", ("easter",)),
    ("pentecost", "Pentecost", ()),
    ("holy-cross", "Holy Cross", ()),
    ("ordinary-time", "Ordinary Time", ()),
)
DEFAULT_ALIAS_NAMES = {
    "birth-of-our-lord": "Birth of Our Lord",
    "great-lent": "Great Lent",
    "passion-week": "Passion Week",
}


def consolidate_seasons(apps, schema_editor):
    db = schema_editor.connection.alias
    seasons = apps.get_model("hymns", "LiturgicalSeason").objects.using(db)
    hymn_model = apps.get_model("hymns", "Hymn")
    hymns = hymn_model._base_manager.using(db)
    link_model = hymn_model.seasons.through
    links = link_model.objects.using(db)
    masses = apps.get_model("masses", "Mass").objects.using(db)
    overrides = apps.get_model("choirs", "CalendarOverride").objects.using(db)
    settings = apps.get_model("choirs", "CalendarSettings").objects.using(db)
    affected_choirs = set()
    now = timezone.now()

    for order, (slug, name, aliases) in enumerate(SEASONS):
        target = seasons.filter(slug=slug).first()
        if target is None:
            target = (
                seasons.annotate(normalized=Lower(Trim("name")))
                .filter(normalized=name.lower())
                .first()
            )
        if target is None and aliases:
            target = seasons.filter(slug=aliases[0]).first()
        if target is None:
            target = seasons.create(slug=slug, name=name, display_order=order)
        else:
            # Keep coordinator-edited names when reusing the stable category ID.
            if target.name == DEFAULT_ALIAS_NAMES.get(target.slug):
                target.name = name
            if not target.is_active:
                target.is_active = seasons.filter(slug__in=aliases, is_active=True).exists()
            target.slug = slug
            target.display_order = order
            target.save(update_fields=["slug", "name", "is_active", "display_order", "updated_at"])

        retired = seasons.filter(slug__in=aliases).exclude(pk=target.pk)
        old_links = links.filter(liturgicalseason_id__in=retired.values("pk"))
        affected_hymns = old_links.order_by().values_list("hymn_id", flat=True).distinct()
        for hymn_ids in batched(affected_hymns.iterator(chunk_size=500), 500):
            links.bulk_create(
                [link_model(hymn_id=pk, liturgicalseason_id=target.pk) for pk in hymn_ids],
                ignore_conflicts=True,
            )
            hymns.filter(pk__in=hymn_ids).update(updated_at=now)
        old_links.delete()
        masses.filter(liturgical_season__in=retired).update(
            liturgical_season_id=target.pk, revision=F("revision") + 1
        )
        old_overrides = overrides.filter(season__in=retired)
        affected_choirs.update(old_overrides.values_list("choir_id", flat=True))
        old_overrides.update(season_id=target.pk)
        retired.update(is_active=False, updated_at=now)

    settings.filter(choir_id__in=affected_choirs).update(version=F("version") + 1)


class Migration(migrations.Migration):
    dependencies = [
        ("hymns", "0006_member_submissions"),
        ("masses", "0002_mass_choir"),
        ("choirs", "0002_calendarsettings_calendaroverride"),
    ]
    # Reversing the migration marker cannot safely split merged classifications.
    operations = [migrations.RunPython(consolidate_seasons, migrations.RunPython.noop)]
