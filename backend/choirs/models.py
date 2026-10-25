from django.conf import settings
from django.db import models


class Choir(models.Model):
    name = models.CharField(max_length=150)
    description = models.TextField(blank=True, max_length=2000)
    is_public = models.BooleanField(default=False)
    show_member_count = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]

    def __str__(self):
        return self.name


class Membership(models.Model):
    choir = models.ForeignKey(Choir, on_delete=models.CASCADE, related_name="memberships")
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="choir_memberships"
    )
    role = models.CharField(
        max_length=8, choices=[("Member", "Member"), ("Planner", "Planner")], default="Member"
    )
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["choir", "user"], name="choir_user_unique")]


class JoinRequest(models.Model):
    choir = models.ForeignKey(Choir, on_delete=models.CASCADE, related_name="join_requests")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    status = models.CharField(
        max_length=10,
        choices=[(s, s) for s in ("pending", "approved", "declined", "cancelled")],
        default="pending",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["choir", "user"], name="choir_request_user_unique")
        ]


class JoinCode(models.Model):
    choir = models.ForeignKey(Choir, on_delete=models.CASCADE, related_name="codes")
    code = models.CharField(max_length=8, unique=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["choir"], condition=models.Q(is_active=True), name="choir_one_active_code"
            )
        ]
