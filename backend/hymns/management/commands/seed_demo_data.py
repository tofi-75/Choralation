"""Optional fictional development hymns, separate from production category seeds."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.permissions import Role
from hymns.models import CATEGORY_TYPES, Hymn
from hymns.services import require_role, save_hymn

SOURCE = "Mass Hymn Picker fictional demo; no real lyrics or usage"
TITLES = [
    "ترنيمة تجريبية — القيامة",
    "Fictional neutral hymn",
    "ܩܠܐ — Fictional Syriac hymn",
    "Demo — Light at the Door",
    "Demo — A Song of Welcome",
    "Demo — Voices of Hope",
    "Demo — The Quiet Prayer",
    "Demo — Gathered in Peace",
    "Demo — Bread for the Journey",
    "Demo — Morning Thanksgiving",
    "Demo — A Joyful Procession",
    "Demo — Mary, Our Guide",
    "Demo — A Heart Renewed",
    "Demo — The Promise of Dawn",
    "Demo — Come, Holy Spirit",
    "Demo — Before the Cross",
    "Demo — A Candle in the Night",
    "Demo — The Living Water",
    "Demo — Remember Your People",
    "Demo — Mercy at the Table",
    "Demo — A New Beginning",
    "Demo — The Shepherd's Call",
    "Demo — Glory and Praise",
    "Demo — Sent in Love",
    "Demo — Rest in Your Presence",
    "Demo — Youthful Praise",
    "Demo — One in Communion",
    "Demo — With Grateful Hearts",
    "Demo — A Psalm of Trust",
    "Demo — The Open Door",
    "Demo — Rejoice Together",
    "Demo — The Peace We Share",
    "Demo — Waiting in Hope",
    "Demo — The Gift of Light",
    "Demo — Remembered in Love",
    "Demo — Our Closing Prayer",
]


class Command(BaseCommand):
    help = "Add 36 fictional development hymns covering every active category and tag."

    def add_arguments(self, parser):
        parser.add_argument("--username", required=True)

    @transaction.atomic
    def handle(self, *args, **options):
        if not settings.DEBUG or settings.DATABASES["default"]["HOST"] not in {
            "127.0.0.1",
            "localhost",
        }:
            raise CommandError("Demo data is restricted to a local development database.")
        try:
            actor = get_user_model().objects.get(username=options["username"])
        except get_user_model().DoesNotExist as error:
            raise CommandError("Provide an existing Admin or Planner username.") from error
        require_role(actor, Role.PLANNER)
        choices = {
            kind: list(model.objects.filter(is_active=True).order_by("display_order", "id"))
            for kind, model in CATEGORY_TYPES.items()
        }
        if any(not rows for rows in choices.values()):
            raise CommandError(
                "Each category type needs an active choice. Run seed_initial_data first."
            )
        created = 0
        for index, title in enumerate(TITLES):
            if Hymn.objects.filter(title=title, source_or_hymnal=SOURCE).exists():
                continue

            # Partition each dimension across 36 rows, covering custom active choices
            # too (even when a dimension grows beyond 36). Never relabel user data.
            def ids(kind, index=index):
                rows = choices[kind]
                assigned = rows[index :: len(TITLES)] or [rows[index % len(rows)]]
                return [row.pk for row in assigned]

            neutral = index % 6 == 1
            polyphonic = index % 5 == 0
            save_hymn(
                {
                    "title": title,
                    "language_id": choices["languages"][index % len(choices["languages"])].pk,
                    "genre_ids": ids("genres"),
                    "placement_ids": ids("mass-placements"),
                    # Neutral hymns may still carry explicit season classifications.
                    "season_ids": ids("liturgical-seasons"),
                    "tag_ids": ids("tags"),
                    "is_season_neutral": neutral,
                    "is_polyphonic": polyphonic,
                    "voices": ["Soprano", "Alto", "Tenor", "Bass"] if polyphonic else [],
                    "estimated_duration_minutes": str(2 + (index % 7) * 0.5),
                    "source_or_hymnal": SOURCE,
                    "notes": "Fictional development example. Replace with your team's real hymn information.",
                },
                actor,
            )
            created += 1
        self.stdout.write(
            f"36 fictional demo hymn identities ready; {created} created. Existing matching records preserved."
        )
