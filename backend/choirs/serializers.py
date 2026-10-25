from rest_framework import serializers

from accounts.serializers import StrictSerializer
from choirs.models import Choir


class ChoirWriteSerializer(StrictSerializer):
    name = serializers.CharField(max_length=150)
    description = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    is_public = serializers.BooleanField(required=False)
    show_member_count = serializers.BooleanField(required=False)


class ChoirSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(allow_null=True, read_only=True)
    role = serializers.CharField(allow_null=True, read_only=True)

    class Meta:
        model = Choir
        fields = [
            "id",
            "name",
            "description",
            "is_public",
            "show_member_count",
            "member_count",
            "role",
        ]


class RosterSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    user_id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=["Member", "Planner"])


class RequestPreviewSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    status = serializers.ChoiceField(choices=["pending", "approved", "declined", "cancelled"])


class ChoirDetailSerializer(ChoirSerializer):
    members = RosterSerializer(many=True)
    requests = RequestPreviewSerializer(many=True, required=False)
    code = serializers.CharField(required=False)

    class Meta(ChoirSerializer.Meta):
        fields = [*ChoirSerializer.Meta.fields, "members", "requests", "code"]


class DirectorySerializer(serializers.Serializer):
    count = serializers.IntegerField()
    next = serializers.URLField(allow_null=True)
    previous = serializers.URLField(allow_null=True)
    results = ChoirSerializer(many=True)


class ApplicationSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    choir_id = serializers.IntegerField()
    choir_name = serializers.CharField()
    status = serializers.ChoiceField(choices=["pending", "approved", "declined", "cancelled"])


class RequestResultSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    status = serializers.ChoiceField(choices=["pending", "approved", "declined", "cancelled"])


class CodeSerializer(StrictSerializer):
    code = serializers.RegexField(r"^[A-HJ-NP-Z2-9]{8}$", max_length=8)

    def to_internal_value(self, data):
        if not isinstance(data, dict):
            return super().to_internal_value(data)
        data = dict(data)
        data["code"] = str(data.get("code", "")).strip().upper().replace(" ", "").replace("-", "")
        return super().to_internal_value(data)


class JoinSerializer(StrictSerializer):
    choir_id = serializers.IntegerField(min_value=1)
    code = serializers.CharField(required=False, max_length=16)


class DecisionSerializer(StrictSerializer):
    status = serializers.ChoiceField(choices=["approved", "declined"])


class MemberSerializer(StrictSerializer):
    role = serializers.ChoiceField(choices=["Member", "Planner"])


class ConfirmSerializer(StrictSerializer):
    confirm = serializers.BooleanField()

    def validate_confirm(self, value):
        if not value:
            raise serializers.ValidationError("Confirm this action first.")
        return value
