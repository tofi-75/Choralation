"""Strict metadata/program writes and nested saved reads; revision is server-owned."""

from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from accounts.serializers import StrictSerializer
from hymns.serializers import CategoryReadSerializer, HymnReadSerializer, OptionalText
from masses.selectors import program_warnings


class MassWriteSerializer(StrictSerializer):
    date = serializers.DateField()
    title = OptionalText(max_length=255)
    liturgical_season_id = serializers.IntegerField(min_value=1, allow_null=True, required=False)
    notes = OptionalText()


class SelectionWriteSerializer(StrictSerializer):
    id = serializers.IntegerField(min_value=1, required=False)
    placement_id = serializers.IntegerField(min_value=1)
    hymn_id = serializers.IntegerField(min_value=1)
    position = serializers.IntegerField(min_value=0)
    notes = OptionalText()


class ProgramWriteSerializer(StrictSerializer):
    selections = SelectionWriteSerializer(many=True)


class RandomPickRequestSerializer(StrictSerializer):
    # Explicit context includes unsaved metadata and choices in the browser.
    season_id = serializers.IntegerField(min_value=1)
    placement_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), allow_empty=False, max_length=100
    )
    excluded_hymn_ids = serializers.ListField(
        child=serializers.IntegerField(min_value=1), max_length=10000
    )


class RandomPickSerializer(serializers.Serializer):
    placement_id = serializers.IntegerField()
    hymn = HymnReadSerializer()


class RandomPicksSerializer(serializers.Serializer):
    picks = RandomPickSerializer(many=True)
    unfilled_placement_ids = serializers.ListField(child=serializers.IntegerField())


class WarningSerializer(serializers.Serializer):
    code = serializers.CharField()
    hymn_id = serializers.IntegerField()
    selection_ids = serializers.ListField(child=serializers.IntegerField())
    placement_id = serializers.IntegerField(required=False)
    facts = serializers.DictField()


class SelectionReadSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    placement = CategoryReadSerializer()
    hymn = HymnReadSerializer()
    position = serializers.IntegerField()
    notes = serializers.CharField(allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()


class MassSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    choir_id = serializers.IntegerField()
    date = serializers.DateField()
    title = serializers.CharField()
    liturgical_season = CategoryReadSerializer(allow_null=True)
    notes = serializers.CharField(allow_null=True)
    status = serializers.ChoiceField(choices=["draft", "finalized"])
    revision = serializers.IntegerField()
    selection_count = serializers.IntegerField()
    created_by = serializers.IntegerField(source="created_by_id", allow_null=True)
    updated_by = serializers.IntegerField(source="updated_by_id", allow_null=True)
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
    finalized_at = serializers.DateTimeField(allow_null=True)


class MassListSerializer(MassSummarySerializer):
    # Annotated by the list selector using the same day as its ordering.
    is_archived = serializers.BooleanField()


class MassReadSerializer(MassSummarySerializer):
    selection_count = serializers.SerializerMethodField()
    program = SelectionReadSerializer(source="selections", many=True)
    warnings = serializers.SerializerMethodField()

    @extend_schema_field(serializers.IntegerField())
    def get_selection_count(self, instance):
        return len(instance.selections.all())

    @extend_schema_field(WarningSerializer(many=True))
    def get_warnings(self, instance):
        return program_warnings(instance)


class ProgramReadSerializer(serializers.Serializer):
    mass_id = serializers.IntegerField()
    revision = serializers.IntegerField()
    selections = SelectionReadSerializer(many=True)
    warnings = WarningSerializer(many=True)


class HistoryHymnSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()


class HistorySelectionSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    placement = CategoryReadSerializer()
    hymn = HistoryHymnSerializer()
    position = serializers.IntegerField()
    notes = serializers.CharField(allow_null=True)


class MassHistorySerializer(MassListSerializer):
    # Bounded three-row preview; the full saved view remains available by ID.
    preview = serializers.SerializerMethodField()

    @extend_schema_field(HistorySelectionSerializer(many=True))
    def get_preview(self, instance):
        return HistorySelectionSerializer(list(instance.selections.all())[:3], many=True).data


class UsageMassSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    date = serializers.DateField()
    title = serializers.CharField()
    status = serializers.CharField()


class HymnUsageSerializer(serializers.Serializer):
    mass = UsageMassSerializer()
    placement = CategoryReadSerializer()
    selection_id = serializers.IntegerField(source="pk")
    position = serializers.IntegerField()
    notes = serializers.CharField(allow_null=True)
