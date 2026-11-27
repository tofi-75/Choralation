"""Prevent browser/proxy caches from storing user-specific API/session responses."""

import psycopg
from django.db import DatabaseError
from django.http import JsonResponse
from django.utils.cache import patch_vary_headers

from common.operations import ReadOnlyError, mutation_guard


class MaintenanceMiddleware:
    """Block every unsafe route, including Admin; authentication stays available."""

    auth_exceptions = {
        "/api/v1/auth/login/",
        "/api/v1/auth/logout/",
        "/admin/login/",
        "/admin/logout/",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in {"GET", "HEAD", "OPTIONS"} or request.path in self.auth_exceptions:
            return self.get_response(request)
        try:
            with mutation_guard():
                return self.get_response(request)
        except (ReadOnlyError, psycopg.Error, DatabaseError):
            response = JsonResponse(
                {
                    "detail": "Editing is temporarily paused for a backup or update. Your changes are still here; retry when editing resumes.",
                    "code": "maintenance_read_only",
                    "errors": {},
                },
                status=503,
            )
            response["Retry-After"] = "30"
            response["Cache-Control"] = "no-store"
            return response


class PrivateResponseMiddleware:
    """Apply no-store to API responses, including auth and schema failures."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "no-store"
            patch_vary_headers(response, ("Cookie",))
        return response
