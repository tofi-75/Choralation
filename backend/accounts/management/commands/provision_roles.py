"""Restore application role groups safely without changing existing memberships."""

from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand

from accounts.permissions import Role


class Command(BaseCommand):
    help = "Idempotently create Admin, Planner, and Viewer groups; no users or passwords."

    def handle(self, *args, **options):
        for role in Role:
            Group.objects.get_or_create(name=str(role))
        self.stdout.write(self.style.SUCCESS("Application roles are ready."))
