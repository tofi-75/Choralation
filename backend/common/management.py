"""Base for application mutations invoked outside the HTTP write barrier."""

import os

from django.core.management.base import BaseCommand, CommandError

from common.operations import ReadOnlyError, mutation_guard


class GuardedCommand(BaseCommand):
    def execute(self, *args, **options):
        startup = os.environ.get("OPERATIONS_STARTUP_COMMANDS") == "true"
        if startup and self.__module__ in {
            "accounts.management.commands.provision_roles",
            "hymns.management.commands.seed_initial_data",
        }:
            return super().execute(*args, **options)
        try:
            with mutation_guard():
                return super().execute(*args, **options)
        except ReadOnlyError:
            raise CommandError(
                "Editing is paused by production operations. Retry after recovery."
            ) from None
