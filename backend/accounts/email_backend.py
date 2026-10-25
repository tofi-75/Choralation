"""Send-only Gmail HTTPS transport. No SMTP ports or mailbox-reading scopes."""

import base64
import json
from email.utils import getaddresses
from urllib.parse import urlencode
from urllib.request import Request

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail.backends.base import BaseEmailBackend
from django.core.validators import validate_email

from accounts.gmail_transport import (
    SEND_URL,
    TOKEN_URL,
    GmailDeliveryError,
    google_json,
    validate_token_response,
)
from config.account_email import public_origin


def sender_address(value):
    if not isinstance(value, str) or "\r" in value or "\n" in value:
        raise GmailDeliveryError("configuration")
    addresses = getaddresses([value])
    if len(addresses) != 1:
        raise GmailDeliveryError("configuration")
    address = addresses[0][1]
    try:
        validate_email(address)
    except ValidationError:
        raise GmailDeliveryError("configuration") from None
    if address.endswith(".invalid"):
        raise GmailDeliveryError("configuration")
    return address.casefold()


class GmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if not email_messages:
            return 0
        messages = [message for message in email_messages if message.recipients()]
        if not messages:
            return 0
        try:
            sender = sender_address(settings.DEFAULT_FROM_EMAIL)
            public_origin(settings.APP_PUBLIC_URL, require_https=not settings.DEBUG)
            if not all(
                isinstance(value, str) and value.strip()
                for value in (
                    settings.GMAIL_CLIENT_ID,
                    settings.GMAIL_CLIENT_SECRET,
                    settings.GMAIL_REFRESH_TOKEN,
                )
            ):
                raise GmailDeliveryError("configuration")
            return self._send(messages, sender)
        except GmailDeliveryError:
            if self.fail_silently:
                return 0
            raise
        except Exception:
            if self.fail_silently:
                return 0
            raise GmailDeliveryError("configuration") from None

    def _send(self, messages, sender):
        credentials = {
            "client_id": settings.GMAIL_CLIENT_ID,
            "client_secret": settings.GMAIL_CLIENT_SECRET,
            "refresh_token": settings.GMAIL_REFRESH_TOKEN,
            "grant_type": "refresh_token",
        }
        access = validate_token_response(
            google_json(Request(TOKEN_URL, data=urlencode(credentials).encode()))
        )
        sent = 0
        for message in messages:
            try:
                if sender_address(message.from_email) != sender:
                    raise GmailDeliveryError("configuration")
                mime = message.message()
                if message.bcc:
                    mime["Bcc"] = ", ".join(message.bcc)
                raw = base64.urlsafe_b64encode(mime.as_bytes()).decode()
                result = google_json(
                    Request(
                        SEND_URL,
                        data=json.dumps({"raw": raw}).encode(),
                        headers={
                            "Authorization": f"Bearer {access}",
                            "Content-Type": "application/json",
                        },
                    )
                )
                if not isinstance(result.get("id"), str) or not result["id"]:
                    raise GmailDeliveryError("invalid_response")
                sent += 1
            except GmailDeliveryError:
                if not self.fail_silently:
                    raise
            except Exception:
                if not self.fail_silently:
                    raise GmailDeliveryError("send_failed") from None
        return sent
