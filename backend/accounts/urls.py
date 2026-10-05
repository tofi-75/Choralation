"""Authentication endpoints mounted beneath /api/v1/auth/."""

from django.urls import path

from accounts.views import CsrfView, LoginView, LogoutView, MeView

urlpatterns = [
    path("csrf/", CsrfView.as_view(), name="auth-csrf"),
    path("login/", LoginView.as_view(), name="auth-login"),
    path("logout/", LogoutView.as_view(), name="auth-logout"),
    path("me/", MeView.as_view(), name="auth-me"),
]
