from django.conf import settings
from django.contrib.auth import get_user_model, login, logout
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect
from drf_spectacular.utils import extend_schema
from rest_framework.exceptions import Throttled, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts import services
from accounts.models import AccountProfile
from accounts.permissions import AdminPermission, VerifiedPermission
from accounts.security import limit
from accounts.serializers import (
    ChoirCreationPermissionSerializer,
    EmailSerializer,
    EmptySerializer,
    MessageSerializer,
    PasswordSerializer,
    RegistrationSerializer,
    ResetSerializer,
    TokenSerializer,
    UsernameAvailabilityResultSerializer,
    UsernameAvailabilitySerializer,
    UserSerializer,
)
from accounts.views import public_user


@method_decorator(csrf_protect, name="dispatch")
class UsernameAvailabilityView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=UsernameAvailabilitySerializer,
        responses={200: UsernameAvailabilityResultSerializer},
    )
    def post(self, request):
        # POST keeps prospective identifiers out of URLs and request logs.
        limit("username-check-total", "deployment", 600, 900)
        limit("username-check-client", request.META.get("REMOTE_ADDR", ""), 90, 900)
        data = UsernameAvailabilitySerializer(data=request.data)
        data.is_valid(raise_exception=True)
        User = get_user_model()
        name = User.normalize_username(data.validated_data["username"].strip())
        candidate = User(username=name)
        try:
            candidate.full_clean(exclude=["password", "email"])
            valid = "@" not in name
        except DjangoValidationError:
            valid = False
        available = valid and not (
            User.objects.filter(username__iexact=name).exists()
            or AccountProfile.objects.filter(username_key=name.lower()).exists()
        )
        return Response(
            {
                "available": available,
                "detail": "Username is available." if available else "Choose another username.",
            }
        )


class ConfigView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        responses={
            200: {
                "type": "object",
                "properties": {
                    "registration_enabled": {"type": "boolean"},
                    "email_verification_enabled": {"type": "boolean"},
                    "password_reset_enabled": {"type": "boolean"},
                },
            }
        }
    )
    def get(self, request):
        return Response(
            {
                "registration_enabled": settings.ACCOUNT_REGISTRATION_ENABLED,
                "email_verification_enabled": settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED,
                "password_reset_enabled": settings.ACCOUNT_PASSWORD_RESET_ENABLED,
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=RegistrationSerializer, responses={201: UserSerializer})
    def post(self, request):
        data = RegistrationSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        limit("register-total", "deployment", 30, 3600)
        limit("register-email", data.validated_data["email"], 5, 3600)
        user = services.register_account(data.validated_data)
        login(request, user, backend="accounts.backends.EmailOrUsernameBackend")
        if settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED:
            try:
                services.issue_link(user, "verify")
            except (services.EmailUnavailable, Throttled):
                pass  # Account/session preserved; verification screen offers resend.
        return Response(public_user(user), status=201)


@method_decorator(csrf_protect, name="dispatch")
class VerificationView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=TokenSerializer, responses={200: UserSerializer})
    def post(self, request):
        services.require_email_feature("verify")
        data = TokenSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        raw = data.validated_data["token"]
        limit("verify-total", "deployment", 100, 900)
        limit("verify", raw, 10, 900)
        actor = request.user if request.user.is_authenticated else None
        with transaction.atomic():
            user = services.consume_link(raw, "verify", actor=actor, email_sign_in=True)
            login(request, user, backend="accounts.backends.EmailOrUsernameBackend")
            identity = public_user(user)
        return Response(identity)


class EmailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=EmailSerializer, responses={200: UserSerializer})
    def post(self, request):
        services.require_email_feature("verify")
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        limit("set-email", request.user.pk)
        services.set_email(request.user, data.validated_data["email"])
        return Response(public_user(request.user))


class ResendView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=EmptySerializer, responses={200: MessageSerializer})
    def post(self, request):
        services.require_email_feature("verify")
        EmptySerializer(data=request.data).is_valid(raise_exception=True)
        if not services.profile_for(request.user).verified_at:
            services.issue_link(request.user, "verify")
        return Response(
            {
                "detail": "If verification is needed, a link has been sent. Check your inbox and spam folder."
            }
        )


@method_decorator(csrf_protect, name="dispatch")
class ResetRequestView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=EmailSerializer, responses={200: MessageSerializer})
    def post(self, request):
        services.require_email_feature("reset")
        data = EmailSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        email = data.validated_data["email"].lower()
        limit("reset-total", "deployment", 100, 3600)
        limit("reset-request", email, 3, 3600)
        user = (
            get_user_model()
            .objects.filter(
                is_active=True,
                account_profile__email=email,
                account_profile__verified_at__isnull=False,
            )
            .first()
        )
        if user:
            try:
                services.issue_link(user, "reset")
            except (services.EmailUnavailable, Throttled):
                pass  # Same response for existing/missing addresses and delivery errors.
        return Response({"detail": "If a verified account matches, a reset link has been sent."})


@method_decorator(csrf_protect, name="dispatch")
class ResetView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(request=ResetSerializer, responses={200: MessageSerializer})
    def post(self, request):
        services.require_email_feature("reset")
        data = ResetSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        limit("reset-token", data.validated_data["token"], 5, 900)
        services.consume_link(
            data.validated_data["token"], "reset", password=data.validated_data["password"]
        )
        logout(request)
        return Response({"detail": "Password updated. Sign in with your new password."})


class PasswordView(APIView):
    permission_classes = [VerifiedPermission]

    @extend_schema(request=PasswordSerializer, responses={200: MessageSerializer})
    def post(self, request):
        data = PasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        limit("password-change", request.user.pk)
        if not request.user.check_password(data.validated_data["current_password"]):
            raise ValidationError({"current_password": ["The current password is incorrect."]})
        services.check_password(data.validated_data["password"], request.user)
        request.user.set_password(data.validated_data["password"])
        request.user.save(update_fields=["password"])
        logout(request)
        return Response({"detail": "Password updated. Sign in again."})


class ChoirCreationPermissionView(APIView):
    permission_classes = [AdminPermission]

    @extend_schema(request=ChoirCreationPermissionSerializer, responses={200: MessageSerializer})
    def post(self, request):
        data = ChoirCreationPermissionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = get_user_model().objects.filter(username=data.validated_data["username"]).first()
        if user is None:
            raise ValidationError({"username": ["Account not found."]})
        profile = services.profile_for(user)
        profile.can_create_choirs = data.validated_data["can_create_choirs"]
        profile.save(update_fields=["can_create_choirs"])
        return Response(
            {"detail": "Choir creation permission updated. Existing choir roles are unchanged."}
        )
