"""Add missing Maronite season choices; retain all existing IDs and classifications."""

from django.db import migrations
from django.db.models import Max


def add_seasons(apps, schema_editor):
    model = apps.get_model("hymns", "LiturgicalSeason")
    model = model.objects.using(schema_editor.connection.alias)
    last = model.aggregate(last=Max("display_order"))["last"] or 0
    for offset, (slug, name) in enumerate(
        [
            ("birth-of-our-lord", "Birth of Our Lord"),
            ("epiphany", "Epiphany"),
            ("commemorations", "Commemorations"),
            ("great-lent", "Great Lent"),
            ("passion-week", "Passion Week"),
            ("resurrection", "Resurrection"),
            ("holy-cross", "Holy Cross"),
        ],
        start=1,
    ):
        if not model.filter(name__iexact=name).exists():
            model.get_or_create(slug=slug, defaults={"name": name, "display_order": last + offset})


class Migration(migrations.Migration):
    dependencies = [("hymns", "0002_sheet_music_and_polyphony")]
    # Seeded choices may acquire references; reverse never deletes user data.
    operations = [migrations.RunPython(add_seasons, migrations.RunPython.noop)]
