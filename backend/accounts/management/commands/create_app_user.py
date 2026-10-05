"""Provision a non-superuser through a prompt or process-scoped secret variable.

Existing usernames are rejected, never silently overwritten. Passwords are
validated, hashed by Django, and never accepted as command-line arguments or
printed. Use Django's createsuperuser for the first protected-admin account.
"""

import getpass
import os

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from accounts.permissions import Role


class Command(BaseCommand):
    help = "Create an application user with a role (password prompt or --password-env NAME)."

    def add_arguments(self, parser):
        parser.add_argument("username")
        parser.add_argument(
            "--role", choices=[str(role) for role in Role], default=str(Role.VIEWER)
        )
        parser.add_argument(
            "--password-env", help="Name of a process variable containing the password."
        )

    @transaction.atomic
    def handle(self, *args, **options):
        user_model = get_user_model()
        username = options["username"].strip()
        if not username or user_model.objects.filter(username=username).exists():
            raise CommandError("Provide a nonempty, unused username.")
        password_variable = options.get("password_env")
        password = (
            os.environ.get(password_variable, "")
            if password_variable
            else getpass.getpass("Password: ")
        )
        user = user_model(username=username)
        try:
            user.full_clean(exclude=["password"])
            validate_password(password, user)
        except ValidationError as error:
            raise CommandError(" ".join(error.messages)) from error
        user.set_password(password)
        user.save()
        group, _ = Group.objects.get_or_create(name=options["role"])
        user.groups.add(group)
        self.stdout.write(self.style.SUCCESS(f"Created {username} with {group.name} access."))
