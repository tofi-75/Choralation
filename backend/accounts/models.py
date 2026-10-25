"""Account extensions and durable, secret-free authentication state."""

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower


class AccountProfile(models.Model):
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="account_profile"
    )
    email = models.EmailField(null=True, blank=True, unique=True)
    username_key = models.CharField(max_length=150, null=True, blank=True, unique=True)
    verified_at = models.DateTimeField(null=True, blank=True)
    can_create_choirs = models.BooleanField(default=False)
    requires_verification = models.BooleanField(default=False)

    class Meta:
        constraints = [models.UniqueConstraint(Lower("email"), name="account_email_case_unique")]


class AccountToken(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    digest = models.CharField(max_length=64, unique=True)
    purpose = models.CharField(max_length=12, choices=[("verify", "Verify"), ("reset", "Reset")])
    email = models.EmailField()
    expires_at = models.DateTimeField()
    consumed_at = models.DateTimeField(null=True, blank=True)


class RateBucket(models.Model):
    key = models.CharField(max_length=64, unique=True)
    started_at = models.DateTimeField()
    attempts = models.PositiveIntegerField(default=0)
