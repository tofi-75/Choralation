"""Verify the active private S3 storage without touching application records."""

from django.core.management.base import BaseCommand, CommandError

from hymns.storage_checks import StorageCheckFailed, check_storage


class Command(BaseCommand):
    help = "Verify private S3 uploads, readback and cleanup using one unique temporary object."

    def handle(self, *args, **options):
        try:
            check_storage()
        except StorageCheckFailed as error:
            raise CommandError(str(error)) from None
        self.stdout.write("Private S3 storage verified: write, readback and cleanup passed.")
