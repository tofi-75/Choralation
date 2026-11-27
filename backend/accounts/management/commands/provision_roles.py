"""Restore application role groups safely without changing existing memberships."""

from django.contrib.auth.models import Group

from accounts.permissions import Role
from common.management import GuardedCommand


class Command(GuardedCommand):
    help = "Idempotently create Admin, Choirmaster, and User groups; no users or passwords."

    def handle(self, *args, **options):
        for role in Role:
            Group.objects.get_or_create(name=str(role))
        self.stdout.write(self.style.SUCCESS("Application roles are ready."))
