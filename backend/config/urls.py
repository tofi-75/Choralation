"""Versioned API routes and protected schema; no unimplemented domain routes."""

from django.contrib import admin
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView
from rest_framework.renderers import JSONRenderer

from common.views import health_live, health_ready

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("accounts.urls")),
    path(
        "api/v1/schema/", SpectacularAPIView.as_view(renderer_classes=[JSONRenderer]), name="schema"
    ),
    path("health/live/", health_live, name="health-live"),
    path("health/ready/", health_ready, name="health-ready"),
]
handler500 = "common.errors.server_error"
