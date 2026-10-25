"""Public information must remain readable independently of the account API."""

from django.conf import settings
from django.shortcuts import render
from django.views.decorators.http import require_safe


@require_safe
def information(request, page):
    response = render(
        request,
        f"public/{page}.html",
        {
            "title": {
                "about": "About Choralation",
                "privacy": "Privacy policy",
                "terms": "Terms of use",
            }[page],
            "registration_open": settings.ACCOUNT_REGISTRATION_ENABLED,
            "email_verification_enabled": settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED,
            "password_reset_enabled": settings.ACCOUNT_PASSWORD_RESET_ENABLED,
        },
    )
    response["Cache-Control"] = "no-cache"
    response["Content-Security-Policy"] = (
        "default-src 'none'; style-src 'self'; img-src 'self'; "
        "base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
    )
    response["Referrer-Policy"] = "no-referrer"
    return response
