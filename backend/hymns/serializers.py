"""Strict write contracts, nested reads, and field errors for library forms."""

from decimal import Decimal

from django.core.validators import URLValidator
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from hymns.models import Hymn
from hymns.uploads import validate_pdf


class OptionalText(serializers.CharField):
    """Normalize blank optional metadata to null, preserving internal newlines."""

    def __init__(self, **kwargs):
        super().__init__(required=False, allow_null=True, allow_blank=True, **kwargs)

    def run_validation(self, data=serializers.empty):
        value = super().run_validation(data)
        return value.strip() or None if isinstance(value, str) else value


class CategoryWriteSerializer(StrictSerializer):
    name = serializers.CharField(max_length=150)
    description = OptionalText()
    display_order = serializers.IntegerField(min_value=0, required=False)
    is_active = serializers.BooleanField(required=False)


class CategoryReadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    name = serializers.CharField()
    slug = serializers.CharField()
    description = serializers.CharField(allow_null=True)
    is_active = serializers.BooleanField()
    display_order = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class CategoryDetailSerializer(CategoryReadSerializer):
    reference_counts = serializers.SerializerMethodField()

    @extend_schema_field(serializers.DictField(child=serializers.IntegerField()))
    def get_reference_counts(self, instance):
        from accounts.permissions import Role, role_for
        from hymns.services import reference_counts

        request = self.context.get("request")
        if request and role_for(request.user) != Role.ADMIN:
            return {}

        return reference_counts(instance)


class CategoryReorderResponseSerializer(serializers.Serializer):
    results = CategoryReadSerializer(many=True)


class ReorderSerializer(StrictSerializer):
    ordered_ids = serializers.ListField(child=serializers.IntegerField(min_value=1))


class HymnWriteSerializer(StrictSerializer):
    title = serializers.CharField(max_length=255)
    language_id = serializers.IntegerField(min_value=1)
    genre_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)
    season_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)
    placement_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=False
    )
    tag_ids = serializers.ListField(child=serializers.IntegerField(min_value=1), required=False)
    is_season_neutral = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)
    latin_title = OptionalText(max_length=255)
    lyrics = OptionalText()
    tempo = OptionalText(max_length=50)
    alternate_title = OptionalText(max_length=255)
    first_line = OptionalText(max_length=500)
    composer = OptionalText(max_length=255)
    arranger = OptionalText(max_length=255)
    notes = OptionalText()
    source_or_hymnal = OptionalText(max_length=255)
    hymnal_number = OptionalText(max_length=100)
    default_key = OptionalText(max_length=50)
    estimated_duration_minutes = serializers.DecimalField(
        max_digits=6, decimal_places=2, min_value=Decimal("0.01"), allow_null=True, required=False
    )
    audio_url = OptionalText(max_length=1000, validators=[URLValidator(schemes=["http", "https"])])
    sheet_music_url = OptionalText(
        max_length=1000, validators=[URLValidator(schemes=["http", "https"])]
    )
    sheet_music_pdf = serializers.FileField(required=False, validators=[validate_pdf])
    remove_sheet_music_pdf = serializers.BooleanField(required=False)
    is_polyphonic = serializers.BooleanField(required=False)
    voices = serializers.ListField(
        child=serializers.CharField(max_length=80), max_length=32, required=False
    )

    def validate_voices(self, names):
        if len({name.casefold() for name in names}) != len(names):
            raise serializers.ValidationError("Each voice needs a distinct name.")
        return names

    def validate(self, attrs):
        # Relationship existence/active-state checks run again under row locks.
        for field in ("genre_ids", "season_ids", "placement_ids", "tag_ids"):
            if field in attrs:
                attrs[field] = sorted(set(attrs[field]))
        if attrs.get("remove_sheet_music_pdf") and "sheet_music_pdf" in attrs:
            raise serializers.ValidationError(
                {"sheet_music_pdf": ["Choose replacement or removal, not both."]}
            )
        return attrs


class HymnMultipartWriteSerializer(StrictSerializer):
    """Multipart envelope retains typed JSON lists/booleans instead of string coercion."""

    data = serializers.JSONField()
    sheet_music_pdf = serializers.FileField(required=False)


class SheetMusicReadSerializer(serializers.Serializer):
    name = serializers.CharField()
    url = serializers.CharField()


class HymnSubmitSerializer(StrictSerializer):
    choir_id = serializers.IntegerField(min_value=1)
    expected_updated_at = serializers.DateTimeField()


class HymnReviewSerializer(StrictSerializer):
    decision = serializers.ChoiceField(choices=["approve", "decline"])
    expected_updated_at = serializers.DateTimeField()
    note = serializers.CharField(max_length=1000, required=False, allow_blank=True)


class SubmissionInfoSerializer(serializers.Serializer):
    choir_id = serializers.IntegerField(allow_null=True)
    choir_name = serializers.CharField(allow_null=True)
    submitted_by = serializers.CharField(allow_null=True)
    note = serializers.CharField()
    can_review = serializers.BooleanField()


class HymnReadSerializer(serializers.ModelSerializer):
    submission = serializers.SerializerMethodField()

    @extend_schema_field(SubmissionInfoSerializer(allow_null=True))
    def get_submission(self, instance):
        if instance.publication_status == "published":
            return None
        return {
            "choir_id": instance.submitted_to_id,
            "choir_name": instance.submitted_to.name if instance.submitted_to_id else None,
            "submitted_by": instance.created_by.username if instance.created_by_id else None,
            "note": instance.review_note,
            "can_review": instance.publication_status == "pending"
            and getattr(instance, "can_review_submission", False),
        }

    usage_count = serializers.IntegerField(read_only=True)
    last_used_date = serializers.DateField(read_only=True, allow_null=True)
    language = CategoryReadSerializer()
    genres = CategoryReadSerializer(many=True)
    seasons = CategoryReadSerializer(many=True)
    placements = CategoryReadSerializer(many=True)
    tags = CategoryReadSerializer(many=True)
    sheet_music_pdf = serializers.SerializerMethodField()

    @extend_schema_field(SheetMusicReadSerializer(allow_null=True))
    def get_sheet_music_pdf(self, instance):
        if not instance.sheet_music_pdf:
            return None
        return {
            "name": instance.sheet_music_pdf_name,
            "url": f"/api/v1/hymns/{instance.pk}/sheet-music/",
        }

    class Meta:
        model = Hymn
        fields = [
            "id",
            "title",
            "publication_status",
            "submission",
            "usage_count",
            "last_used_date",
            "latin_title",
            "lyrics",
            "tempo",
            "alternate_title",
            "first_line",
            "composer",
            "arranger",
            "language",
            "notes",
            "source_or_hymnal",
            "hymnal_number",
            "default_key",
            "estimated_duration_minutes",
            "audio_url",
            "sheet_music_url",
            "sheet_music_pdf",
            "is_polyphonic",
            "voices",
            "is_season_neutral",
            "is_active",
            "genres",
            "seasons",
            "placements",
            "tags",
            "created_at",
            "updated_at",
            "created_by",
            "updated_by",
        ]


class AttachmentAuditSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    filename = serializers.CharField()
    status = serializers.ChoiceField(choices=["present", "missing", "inaccessible"])


class AttachmentAuditPageSerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    storage_backend = serializers.ChoiceField(choices=["s3", "local"])
    results = AttachmentAuditSerializer(many=True)
