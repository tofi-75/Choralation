"""Bounded, non-redirecting HTTPS requests to the two send-only Google endpoints."""

import json
from http.client import HTTPException
from urllib.error import HTTPError
from urllib.request import HTTPRedirectHandler, build_opener

SCOPE = "https://www.googleapis.com/auth/gmail.send"
TOKEN_URL = "https://oauth2.googleapis.com/token"
SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
MAX_RESPONSE_BYTES = 65536


class GmailDeliveryError(RuntimeError):
    """Only a safe category crosses the provider boundary, never its response body."""

    def __init__(self, category):
        self.category = category
        super().__init__(f"Email delivery unavailable ({category}).")


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def urlopen(request, timeout=10):
    # Default HTTPSHandler validates certificates; do not use an unverified context.
    return build_opener(NoRedirect()).open(request, timeout=timeout)


def google_json(request):
    if request.full_url not in {TOKEN_URL, SEND_URL} or request.get_method() != "POST":
        raise GmailDeliveryError("configuration")
    try:
        with urlopen(request, timeout=10) as response:
            if response.status != 200:
                raise GmailDeliveryError("provider")
            raw = response.read(MAX_RESPONSE_BYTES + 1)
        if len(raw) > MAX_RESPONSE_BYTES:
            raise GmailDeliveryError("invalid_response")
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise GmailDeliveryError("invalid_response")
        return result
    except HTTPError as error:
        category = (
            "authentication"
            if error.code in {400, 401}
            else "permission"
            if error.code == 403
            else "rate_limit"
            if error.code == 429
            else "redirect"
            if 300 <= error.code < 400
            else "provider"
        )
        error.close()
        raise GmailDeliveryError(category) from None
    except (OSError, HTTPException):
        raise GmailDeliveryError("network") from None
    except (ValueError, UnicodeError):
        raise GmailDeliveryError("invalid_response") from None


def validate_token_response(token):
    access = token.get("access_token")
    if not isinstance(access, str) or not access.strip() or len(access) > 16384:
        raise GmailDeliveryError("invalid_response")
    token_type = token.get("token_type", "Bearer")
    if not isinstance(token_type, str) or token_type.lower() != "bearer":
        raise GmailDeliveryError("invalid_response")
    if "scope" in token and (
        not isinstance(token["scope"], str) or set(token["scope"].split()) != {SCOPE}
    ):
        raise GmailDeliveryError("permission")
    return access
