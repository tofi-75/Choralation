"""Validate public account-link origins without reflecting private configuration."""

from urllib.parse import urlsplit

from django.core.exceptions import ImproperlyConfigured


def public_origin(value, *, require_https=False):
    try:
        parsed = urlsplit(value)
        port = parsed.port
        valid = (
            parsed.scheme in {"http", "https"}
            and parsed.hostname
            and not parsed.username
            and not parsed.password
            and not parsed.query
            and not parsed.fragment
            and parsed.path in {"", "/"}
            and not any(character.isspace() for character in value)
            and "\\" not in value
            and (port is None or 0 < port <= 65535)
        )
        if parsed.scheme == "http":
            valid = (
                valid and not require_https and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
            )
        if not valid:
            raise ValueError
    except (ValueError, TypeError):
        raise ImproperlyConfigured(
            "APP_PUBLIC_URL must be a valid HTTPS origin (loopback HTTP is development-only)."
        ) from None
    return value.rstrip("/")
