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
    username = serializers.CharField(max_length=254)
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class UserSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    role = serializers.ChoiceField(choices=[str(role) for role in Role])
    email = serializers.EmailField(allow_null=True)
    email_verified = serializers.BooleanField()
    verification_required = serializers.BooleanField()
    can_create_choirs = serializers.BooleanField()
    can_edit_hymns = serializers.BooleanField()
    can_add_hymns = serializers.BooleanField()


class RegistrationSerializer(StrictSerializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=256)
    password_confirmation = serializers.CharField(
        write_only=True, trim_whitespace=False, max_length=256
    )

    def validate(self, data):
        if data["password"] != data["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": ["Passwords do not match."]}
            )
        return data


class UsernameAvailabilitySerializer(StrictSerializer):
    username = serializers.CharField(max_length=150)


class UsernameAvailabilityResultSerializer(serializers.Serializer):
    available = serializers.BooleanField()
    detail = serializers.CharField()


class EmailSerializer(StrictSerializer):
    email = serializers.EmailField()


class TokenSerializer(StrictSerializer):
    token = serializers.CharField(max_length=100)


class ResetSerializer(TokenSerializer):
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=256)


class PasswordSerializer(StrictSerializer):
    current_password = serializers.CharField(write_only=True, trim_whitespace=False)
    password = serializers.CharField(write_only=True, trim_whitespace=False, max_length=256)


class MessageSerializer(serializers.Serializer):
    detail = serializers.CharField()


class ChoirCreationPermissionSerializer(StrictSerializer):
    username = serializers.CharField(max_length=150)
    can_create_choirs = serializers.BooleanField()


class CsrfSerializer(serializers.Serializer):
    csrf_token = serializers.CharField()


class EmptySerializer(StrictSerializer):
    """Logout accepts an empty JSON object, with no writable user/session fields."""


class ErrorSerializer(serializers.Serializer):
    detail = serializers.CharField()
    code = serializers.CharField()
    errors = serializers.DictField()
