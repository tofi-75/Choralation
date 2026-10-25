"""Versioned API routes and protected schema; no unimplemented domain routes."""

from django.conf import settings
from django.contrib import admin
from django.urls import include, path, re_path
from drf_spectacular.views import SpectacularAPIView
from rest_framework.renderers import JSONRenderer

from common.frontend import frontend_page
from common.public_pages import information
from common.views import health_live, health_ready
from masses.calendar_views import MaroniteCalendarView

urlpatterns = [
    re_path(r"^(?P<page>about|privacy|terms)/?$", information, name="public-information"),
    path("admin/", admin.site.urls),
    path("api/v1/auth/", include("accounts.urls")),
    path("api/v1/calendar/maronite/", MaroniteCalendarView.as_view(), name="maronite-calendar"),
    path("api/v1/", include("hymns.urls")),
    path("api/v1/", include("masses.urls")),
    path("api/v1/", include("choirs.urls")),
    path(
        "api/v1/schema/", SpectacularAPIView.as_view(renderer_classes=[JSONRenderer]), name="schema"
    ),
    path("health/live/", health_live, name="health-live"),
    path("health/ready/", health_ready, name="health-ready"),
]
handler500 = "common.errors.server_error"
# Named React routes only; API/admin/media/missing files never receive HTML.
if settings.SERVE_FRONTEND:
    urlpatterns.append(
        re_path(
            r"^(?:|login|register|verify-email|forgot-password|reset-password|account|choirs(?:/(?:join|new|\d+))?|dashboard|history|hymns(?:/(?:mine|new|\d+(?:/edit)?))?|masses(?:/(?:new|history|\d+(?:/(?:edit|details))?))?)/?$",
            frontend_page,
        )
    )
