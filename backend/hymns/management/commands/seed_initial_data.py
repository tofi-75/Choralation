"""Create missing defaults by stable slug, never reset user-edited seed records."""

from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models.functions import Lower, Trim
from django.utils.text import slugify

from hymns.models import CATEGORY_TYPES

DEFAULTS = {
    "genres": ["Traditional", "Contemporary", "Chant", "Worship", "Marian", "Praise", "Meditative"],
    "liturgical-seasons": [
        "Ordinary Time",
        "Advent",
        "Christmas",
        "Lent",
        "Holy Week",
        "Easter",
        "Pentecost",
        "Birth of Our Lord",
        "Epiphany",
        "Commemorations",
        "Great Lent",
        "Passion Week",
        "Resurrection",
        "Holy Cross",
    ],
    "mass-placements": [
        "Opening",
        "Responsorial",
        "Glory",
        "Offertory",
        "Incense",
        "Pax",
        "Sanctus",
        "Agnus Dei",
        "Communion",
        "Thanksgiving",
        "Closing",
    ],
    "languages": ["Arabic", "English", "French", "Syriac"],
    "tags": [
        "Mary",
        "Eucharist",
        "Resurrection",
        "Peace",
        "Youth",
        "Procession",
        "Prayer",
        "Joy",
        "Repentance",
    ],
}


class Command(BaseCommand):
    help = "Create missing default classifications; preserve renamed/reordered/inactive records."

    @transaction.atomic
    def handle(self, *args, **options):
        created = 0
        for kind, names in DEFAULTS.items():
            model = CATEGORY_TYPES[kind]
            for position, name in enumerate(names):
                slug = slugify(name)
                if model.objects.filter(slug=slug).exists():
                    continue
                # An existing custom row with the same name is also preserved.
                if (
                    model.objects.annotate(normalized=Lower(Trim("name")))
                    .filter(normalized=name.lower())
                    .exists()
                ):
                    continue
                _, added = model.objects.get_or_create(
                    slug=slug, defaults={"name": name, "display_order": position}
                )
                created += added
        self.stdout.write(
            self.style.SUCCESS(
                f"Default classifications ready; {created} created. Existing records preserved."
            )
        )
