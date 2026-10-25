"""Revise standard sections without removing selections or hymn classifications.

Equivalent names retain their IDs. Obsolete sections remain readable when used
by an existing program; custom sections are not changed. Reversing code cannot
safely infer which names an owner subsequently edited, so the data step is forward-only.
"""

from django.db import migrations

SECTIONS = [
    ("opening", "Opening", "opening-hymn"),
    ("responsorial", "Responsorial", "psalm"),
    ("glory", "Glory", None),
    ("offertory", "Offertory", None),
    ("incense", "Incense", None),
    ("pax", "Pax", None),
    ("sanctus", "Sanctus", None),
    ("agnus-dei", "Agnus Dei", None),
    ("communion", "Communion", None),
    ("thanksgiving", "Thanksgiving", None),
    ("closing", "Closing", "closing-recessional"),
]
RETIRED = [
    "entrance-processional",
    "gospel-acclamation",
    "sermon-reflection",
    "anthem",
    "meditation",
]


def update_sections(apps, schema_editor):
    rows = apps.get_model("hymns", "MassPlacement").objects.using(schema_editor.connection.alias)
    # Empty installations get defaults through seed_initial_data; do not create
    # classifications in a database that has never provisioned library defaults.
    if not rows.exists():
        return
    rows.filter(slug__in=RETIRED).update(is_active=False)
    for order, (slug, name, old_slug) in enumerate(SECTIONS):
        target = rows.filter(slug=slug).first() or rows.filter(name__iexact=name).first()
        old = rows.filter(slug=old_slug).first() if old_slug else None
        if target is None and old is not None:
            rows.filter(pk=old.pk).update(name=name, slug=slug, display_order=order, is_active=True)
        else:
            if target is None:
                rows.create(name=name, slug=slug, display_order=order)
            else:
                rows.filter(pk=target.pk).update(display_order=order, is_active=True)
            # A custom target can coexist with the old section. Keep the old
            # references intact instead of merging or moving any selections.
            if old is not None and (target is None or old.pk != target.pk):
                rows.filter(pk=old.pk).update(is_active=False)
    rows.filter(
        is_active=False, slug__in=RETIRED + ["opening-hymn", "psalm", "closing-recessional"]
    ).update(display_order=100)


class Migration(migrations.Migration):
    dependencies = [("hymns", "0004_performance_materials")]
    operations = [migrations.RunPython(update_sections, migrations.RunPython.noop)]
