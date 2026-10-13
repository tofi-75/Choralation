"""Mass-owned revisions protect metadata/programs; referenced library rows stay live.

Deleting a draft cascades only its own selections. Hymn, season, and placement
deletion is protected even for drafts. Guarded lifecycle services own finalization.
"""

from django.conf import settings
from django.db import models


class Mass(models.Model):
    date = models.DateField(db_index=True)
    title = models.CharField(max_length=255)
    liturgical_season = models.ForeignKey(
        "hymns.LiturgicalSeason",
        null=True,
        blank=True,
        on_delete=models.PROTECT,
        related_name="masses",
    )
    notes = models.TextField(null=True, blank=True)
    status = models.CharField(
        max_length=10, choices=[("draft", "Draft"), ("finalized", "Finalized")], default="draft"
    )
    revision = models.PositiveBigIntegerField(default=1)
    finalized_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="created_masses",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        on_delete=models.SET_NULL,
        related_name="updated_masses",
    )

    class Meta:
        ordering = ["-date", "-id"]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(revision__gte=1), name="mass_revision_positive"
            ),
            models.CheckConstraint(
                condition=models.Q(status__in=["draft", "finalized"]), name="mass_valid_status"
            ),
            models.CheckConstraint(
                condition=~models.Q(title__regex=r"^\s*$"), name="mass_title_nonblank"
            ),
        ]

    def __str__(self):
        return self.title


class MassHymnSelection(models.Model):
    mass = models.ForeignKey(Mass, on_delete=models.CASCADE, related_name="selections")
    placement = models.ForeignKey(
        "hymns.MassPlacement", on_delete=models.PROTECT, related_name="selections"
    )
    hymn = models.ForeignKey("hymns.Hymn", on_delete=models.PROTECT, related_name="selections")
    position = models.PositiveIntegerField()
    notes = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["placement__display_order", "placement_id", "position", "id"]
        constraints = [
            # Defer until commit so swapping retained row positions never needs
            # temporary out-of-range positions or replacement identities.
            models.UniqueConstraint(
                fields=["mass", "placement", "position"],
                name="mass_placement_position_unique",
                deferrable=models.Deferrable.DEFERRED,
            ),
        ]
