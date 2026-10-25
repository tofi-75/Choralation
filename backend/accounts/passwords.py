"""A shared password policy for registration, recovery and administration."""

import re

from django.core.exceptions import ValidationError


class CompositionValidator:
    def validate(self, password, user=None):
        if not (
            len(password) >= 8
            and re.search(r"[A-Z]", password)
            and re.search(r"[0-9]", password)
            and re.search(r"[^\w\s]|_", password, re.UNICODE)
        ):
            raise ValidationError(self.get_help_text(), code="password_composition")

    def get_help_text(self):
        return "Use at least 8 characters, one uppercase letter (A–Z), one number and one symbol."
