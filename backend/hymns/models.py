"""Library storage invariants; relationships are independent and labels stay live.

Titles deliberately permit duplicates. Language deletion is protected; M2M
category deletion requires the guarded service because through tables cascade.
Cross-relation validation and permission/locking belong to services, not save().
"""

from django.conf import settings
from django.db import models
from django.db.models.functions import Lower, Trim

from hymns.uploads import pdf_upload_path, validate_pdf


class Category(models.Model):
    name = models.CharField(max_length=150)
    slug = models.SlugField(max_length=180, unique=True)
    description = models.TextField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    display_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True
        ordering = ["display_order", "id"]
        constraints = [
            models.UniqueConstraint(Lower(Trim("name")), name="%(class)s_name_ci_unique"),
            models.CheckConstraint(
                condition=~models.Q(name__regex=r"^\s*$"), name="%(class)s_name_nonblank"
            ),
        ]

    def __str__(self):
        return self.name


class Genre(Category):
    pass


class LiturgicalSeason(Category):
    pass


class MassPlacement(Category):
    pass


class Language(Category):
    pass


class Tag(Category):
    pass


class Hymn(models.Model):
    title = models.CharField(max_length=255)
    latin_title = models.CharField(max_length=255, null=True, blank=True)
    lyrics = models.TextField(null=True, blank=True)
    tempo = models.CharField(max_length=50, null=True, blank=True)
    alternate_title = models.CharField(max_length=255, null=True, blank=True)
    first_line = models.CharField(max_length=500, null=True, blank=True)
    composer = models.CharField(max_length=255, null=True, blank=True)
    arranger = models.CharField(max_length=255, null=True, blank=True)
    language = models.ForeignKey(Language, on_delete=models.PROTECT, related_name="hymns")
    notes = models.TextField(null=True, blank=True)
    source_or_hymnal = models.CharField(max_length=255, null=True, blank=True)
    hymnal_number = models.CharField(max_length=100, null=True, blank=True)
    default_key = models.CharField(max_length=50, null=True, blank=True)
    estimated_duration_minutes = models.DecimalField(
        max_digits=6, decimal_places=2, null=True, blank=True
    )
    audio_url = models.URLField(max_length=1000, null=True, blank=True)
    sheet_music_url = models.URLField(max_length=1000, null=True, blank=True)
    sheet_music_pdf = models.FileField(
        upload_to=pdf_upload_path, validators=[validate_pdf], blank=True
    )
    sheet_music_pdf_name = models.CharField(max_length=255, blank=True)
    is_polyphonic = models.BooleanField(default=False)
    # Voices are ordered names owned by this hymn, with no independent identity/references.
    voices = models.JSONField(default=list, blank=True)
    is_season_neutral = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    genres = models.ManyToManyField(Genre, blank=True, related_name="hymns")
    seasons = models.ManyToManyField(LiturgicalSeason, blank=True, related_name="hymns")
    placements = models.ManyToManyField(MassPlacement, related_name="hymns")
    tags = models.ManyToManyField(Tag, blank=True, related_name="hymns")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="created_hymns",
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="updated_hymns",
    )

    class Meta:
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(title__regex=r"^\s*$"), name="hymn_title_nonblank"
            ),
            models.CheckConstraint(
                condition=models.Q(estimated_duration_minutes__isnull=True)
                | models.Q(estimated_duration_minutes__gt=0),
                name="hymn_duration_positive",
            ),
            models.CheckConstraint(
                condition=models.Q(is_polyphonic=True) | models.Q(voices=[]),
                name="hymn_nonpolyphonic_no_voices",
            ),
        ]

    def __str__(self):
        return self.title


# Fixed type order is also the lock order; never use numeric seed IDs as rules.
CATEGORY_TYPES = {
    "genres": Genre,
    "liturgical-seasons": LiturgicalSeason,
    "mass-placements": MassPlacement,
    "languages": Language,
    "tags": Tag,
}
RELATIONS = {"genres": Genre, "seasons": LiturgicalSeason, "placements": MassPlacement, "tags": Tag}
