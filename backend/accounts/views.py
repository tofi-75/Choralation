"""Same-origin JSON session endpoints with explicit protection on anonymous writes.

DRF session authentication checks CSRF only for authenticated users. Decorating
dispatch with csrf_protect closes that gap for login and repeat logout, while
preserving DRF's validation/error/schema behavior. Login rotates the token;
the client must bootstrap another masked token before its next unsafe request.
"""

from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import role_for
from accounts.serializers import (
    CsrfSerializer,
    EmptySerializer,
    ErrorSerializer,
    LoginSerializer,
    UserSerializer,
)


def public_user(user) -> dict:
    """Expose only identity and resolved role; no permissions/password internals."""
    return {"id": user.pk, "username": user.get_username(), "role": str(role_for(user))}


@method_decorator(ensure_csrf_cookie, name="dispatch")
class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(responses={200: CsrfSerializer})
    def get(self, request):
        """Set the HTTP-only cookie and return its masked same-origin token."""
        return Response({"csrf_token": get_token(request)})


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=LoginSerializer,
        responses={200: UserSerializer, 400: ErrorSerializer, 403: ErrorSerializer},
    )
    def post(self, request):
        """Validate credentials and create a Django session; invalid users stay anonymous."""
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = authenticate(request=request, **serializer.validated_data)
        if user is None:
            return Response(
                {
                    "detail": "The username or password is incorrect.",
                    "code": "invalid_credentials",
                    "errors": {},
                },
                status=400,
            )
        login(request, user)
        return Response(public_user(user))


class MeView(APIView):
    @extend_schema(responses={200: UserSerializer, 403: ErrorSerializer})
    def get(self, request):
        """Return authenticated identity; never silently turn an expired session into Viewer."""
        return Response(public_user(request.user))


@method_decorator(csrf_protect, name="dispatch")
class LogoutView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        request=EmptySerializer, responses={204: None, 400: ErrorSerializer, 403: ErrorSerializer}
    )
    def post(self, request):
        """Clear the Django session, idempotently, while still requiring a valid CSRF token."""
        serializer = EmptySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        logout(request)
        return Response(status=204)
