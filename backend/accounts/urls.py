"""Authentication endpoints mounted beneath /api/v1/auth/."""

from django.urls import path

from accounts.lifecycle_views import (
    ChoirCreationPermissionView,
    ConfigView,
    EmailView,
    PasswordView,
    RegisterView,
    ResendView,
    ResetRequestView,
    ResetView,
    VerificationView,
)
from accounts.views import CsrfView, LoginView, LogoutView, MeView

urlpatterns = [
    path("choir-creation/", ChoirCreationPermissionView.as_view()),
    path("config/", ConfigView.as_view()),
    path("register/", RegisterView.as_view()),
    path("verify-email/", VerificationView.as_view()),
    path("email/", EmailView.as_view()),
    path("resend-verification/", ResendView.as_view()),
    path("password-reset/request/", ResetRequestView.as_view()),
    path("password-reset/confirm/", ResetView.as_view()),
    path("password/", PasswordView.as_view()),
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
]
