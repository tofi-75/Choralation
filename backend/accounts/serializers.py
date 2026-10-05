"""Strict auth request shapes and public user identity; credentials never serialize."""

from rest_framework import serializers

from accounts.permissions import Role


class StrictSerializer(serializers.Serializer):
    """Reject unexpected input fields rather than silently ignoring caller mistakes."""

    def to_internal_value(self, data):
        if isinstance(data, dict):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError(
                    {name: ["Unknown field."] for name in sorted(unknown)}
                )
        return super().to_internal_value(data)


class LoginSerializer(StrictSerializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=[str(role) for role in Role])


class CsrfSerializer(serializers.Serializer):
    csrf_token = serializers.CharField()


class EmptySerializer(StrictSerializer):
    """Logout accepts an empty JSON object, with no writable user/session fields."""


class ErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()
    errors = serializers.DictField()
