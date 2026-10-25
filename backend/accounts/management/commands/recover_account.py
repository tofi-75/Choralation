"""Explicit owner-run account recovery; never changes passwords or emails silently."""

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from accounts.services import profile_for, set_email


class Command(BaseCommand):
    help = "Recover an existing account after independently confirming email ownership."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument("--email", required=True)
        parser.add_argument("--confirm-email-ownership", action="store_true")

    def handle(self, *args, **options):
        if not options["confirm_email_ownership"]:
            raise CommandError("Independently verify ownership and pass --confirm-email-ownership.")
        user = get_user_model().objects.filter(username=options["username"]).first()
        if not user:
            raise CommandError("Existing account not found.")
        from django.core.validators import validate_email

        validate_email(options["email"])
        set_email(user, options["email"])
        profile = profile_for(user)
        profile.verified_at = timezone.now()
        profile.save(update_fields=["verified_at"])
        self.stdout.write("Existing account verified. Password and permissions retained.")
