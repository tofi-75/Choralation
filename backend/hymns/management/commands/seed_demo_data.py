"""Optional fictional development hymns, separate from production category seeds."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from hymns.models import Genre, Hymn, Language, LiturgicalSeason, MassPlacement
from hymns.services import save_hymn

SOURCE = "Mass Hymn Picker fictional demo; no real lyrics or usage"


class Command(BaseCommand):
    help = "Add three clearly fictional local-development hymns for an existing editor."

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
            genre = Genre.objects.get(slug="traditional", is_active=True)
            placement = MassPlacement.objects.get(slug="communion", is_active=True)
            season = LiturgicalSeason.objects.get(slug="easter", is_active=True)
        except (
            get_user_model().DoesNotExist,
            Genre.DoesNotExist,
            MassPlacement.DoesNotExist,
            LiturgicalSeason.DoesNotExist,
        ) as error:
            raise CommandError(
                "Provide an existing editor and run seed_initial_data first; demo defaults must be active."
            ) from error
        for title, slug, neutral in (
            ("ترنيمة تجريبية — القيامة", "arabic", False),
            ("Fictional neutral hymn", "english", True),
            ("ܩܠܐ — Fictional Syriac hymn", "syriac", False),
        ):
            if Hymn.objects.filter(title=title, source_or_hymnal=SOURCE).exists():
                continue
            try:
                language = Language.objects.get(slug=slug, is_active=True)
            except Language.DoesNotExist as error:
                raise CommandError("Demo languages must exist and be active.") from error
            save_hymn(
                {
                    "title": title,
                    "language_id": language.pk,
                    "genre_ids": [genre.pk],
                    "placement_ids": [placement.pk],
                    "season_ids": [] if neutral else [season.pk],
                    "is_season_neutral": neutral,
                    "source_or_hymnal": SOURCE,
                    "notes": "Fictional development example. Replace with your team's real hymn information.",
                },
                actor,
            )
        self.stdout.write("Fictional demo hymns ready; existing matching records preserved.")
