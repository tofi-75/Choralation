from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db.models import Count
from django.db.models.functions import Lower, Trim


class Command(BaseCommand):
    help = "Read-only check of legacy identifiers before opening registration."

    def handle(self, *args, **options):
        User = get_user_model()
        conflicts = 0
        for field in ("username", "email"):
            duplicates = (
                User.objects.exclude(**{field: ""})
                .annotate(key=Lower(Trim(field)))
                .values("key")
                .annotate(n=Count("pk"))
                .filter(n__gt=1)
            )
            count = duplicates.count()
            conflicts += count
            self.stdout.write(f"{field}: {count} conflicting normalized identifiers.")
        if conflicts:
            raise CommandError(
                "Resolve identifier conflicts in Django administration; no accounts were merged or changed."
            )
        self.stdout.write("Account identifier audit passed.")
