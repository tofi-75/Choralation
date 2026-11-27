"""Durable release coordination; never use an expiring cache as a write barrier."""

import uuid

from django.db import models


class OperationsState(models.Model):
    id = models.PositiveSmallIntegerField(primary_key=True, default=1, editable=False)
    database_id = models.UUIDField(default=uuid.uuid4, editable=False)
    read_only = models.BooleanField(default=False)
    operation_id = models.CharField(max_length=120, blank=True)
    phase = models.CharField(max_length=40, default="idle")
    reason = models.CharField(max_length=200, blank=True)
    target_sha = models.CharField(max_length=40, blank=True)
    deployment_id = models.CharField(max_length=120, blank=True)
    snapshot_id = models.CharField(max_length=120, blank=True)
    started_at = models.DateTimeField(null=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_backup = models.JSONField(default=dict)
    last_release = models.JSONField(default=dict)
    last_restore = models.JSONField(default=dict)

    class Meta:
        constraints = [
            models.CheckConstraint(condition=models.Q(id=1), name="operations_singleton")
        ]
