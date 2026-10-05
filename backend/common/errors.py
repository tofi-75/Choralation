"""Keep validation, CSRF, authentication, and production errors predictable.

Never return passwords, token values, raw exceptions, or tracebacks. DRF and
Django middleware failures use the same envelope so the typed client can
distinguish session expiry from a permission denial.
"""

import logging
from uuid import uuid4

from django.http import JsonResponse
from rest_framework import exceptions
from rest_framework.views import exception_handler as drf_exception_handler

logger = logging.getLogger(__name__)


def exception_handler(exc, context):
    """Normalize handled DRF exceptions; unexpected errors follow Django's 500 path."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    code = getattr(exc, "default_code", "api_error")
    errors = {}
    if isinstance(exc, exceptions.ValidationError):
        detail = "Validation failed."
        errors = (
            response.data
            if isinstance(response.data, dict)
            else {"non_field_errors": response.data}
        )
        code = "validation_error"
    else:
        detail = str(response.data.get("detail", "Request failed."))
        if isinstance(exc, exceptions.NotAuthenticated):
            code = "not_authenticated"
        elif isinstance(exc, exceptions.PermissionDenied):
            code = "csrf_failed" if detail.startswith("CSRF Failed:") else "permission_denied"
    response.data = {"detail": detail, "code": code, "errors": errors}
    return response


def csrf_failure(request, reason=""):
    """Return a safe JSON rejection for middleware/anonymous-login CSRF failures."""
    return JsonResponse(
        {
            "detail": "The security token is missing or expired. Refresh and try again.",
            "code": "csrf_failed",
            "errors": {},
        },
        status=403,
    )


def server_error(request):
    """Give production callers a correlation ID while logging details server-side."""
    request_id = uuid4().hex
    logger.error("Unhandled request failure: %s", request_id)
    return JsonResponse(
        {
            "detail": "An unexpected error occurred.",
            "code": "server_error",
            "errors": {},
            "request_id": request_id,
        },
        status=500,
    )
