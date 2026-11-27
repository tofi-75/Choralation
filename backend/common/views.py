"""Minimal diagnostics without leaking settings or database credentials."""

from django.conf import settings
from django.db import DatabaseError, connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET


@require_GET
def health_live(request):
    """Report process liveness independently of database availability."""
    return JsonResponse({"status": "ok"})


@require_GET
def health_ready(request):
    """Check PostgreSQL connectivity; failed readiness is generic and retryable."""
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            if settings.PRODUCTION_OPERATIONS_ENABLED:
                cursor.execute("SELECT database_id FROM common_operationsstate WHERE id=1")
                if not cursor.fetchone():
                    return JsonResponse({"status": "unavailable"}, status=503)
    except DatabaseError:
        return JsonResponse({"status": "unavailable"}, status=503)
    response = JsonResponse(
        {
            "status": "ok",
            "commit": settings.APP_COMMIT_SHA,
            "operations_enabled": settings.PRODUCTION_OPERATIONS_ENABLED,
        }
    )
    response["Cache-Control"] = "no-store"
    return response
