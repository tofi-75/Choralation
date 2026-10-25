"""Account lifecycle without replacing Django users or storing raw link tokens."""

import hashlib
import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import send_mail
from django.db import IntegrityError, transaction
from django.utils import timezone
from rest_framework.exceptions import APIException, ValidationError

from accounts.models import AccountProfile, AccountToken
from accounts.security import limit
from config.account_email import public_origin


class EmailUnavailable(APIException):
    status_code = 503
    default_code = "email_unavailable"
    default_detail = "Email delivery is unavailable. Your account is safe; please try again later."


def profile_for(user):
    return AccountProfile.objects.get_or_create(user=user)[0]


def require_email_feature(purpose):
    enabled = (
        settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED
        if purpose == "verify"
        else settings.ACCOUNT_PASSWORD_RESET_ENABLED
    )
    if not enabled:
        raise EmailUnavailable(
            "Email-based verification and recovery are unavailable. Contact tofi.lattouf@gmail.com for help."
        )


def check_password(value, user):
    try:
        validate_password(value, user)
    except DjangoValidationError as error:
        raise ValidationError({"password": error.messages}) from error


def issue_link(user, purpose):
    if purpose not in {"verify", "reset"}:
        raise ValidationError({"purpose": ["Unknown account action."]})
    require_email_feature(purpose)
    try:
        origin = public_origin(
            settings.APP_PUBLIC_URL,
            require_https=not settings.DEBUG
            and settings.EMAIL_BACKEND == "accounts.email_backend.GmailBackend",
        )
    except Exception:
        raise EmailUnavailable() from None
    profile = profile_for(user)
    if not profile.email:
        raise ValidationError({"email": ["Enter your email address first."]})
    limit("email-user", user.pk, 3, 3600)
    limit("email-total", "deployment", settings.ACCOUNT_EMAIL_DAILY_LIMIT, 86400)
    raw = secrets.token_urlsafe(32)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    # Serialize issuance per account. A failed send does not revoke a usable link.
    with transaction.atomic():
        profile = AccountProfile.objects.select_for_update().get(pk=profile.pk)
        item = AccountToken.objects.create(
            user=user,
            digest=digest,
            purpose=purpose,
            email=profile.email,
            expires_at=timezone.now() + timedelta(hours=24 if purpose == "verify" else 1),
        )
        route = "verify-email" if purpose == "verify" else "reset-password"
        url = f"{origin}/{route}#token={raw}"
        try:
            sent = send_mail(
                "Verify your Choralation email"
                if purpose == "verify"
                else "Reset your Choralation password",
                f"{'Confirm your email' if purpose == 'verify' else 'Choose a new password'}:\n{url}\n\n"
                "If you did not request this, ignore this message. Never share this link.",
                settings.DEFAULT_FROM_EMAIL,
                [profile.email],
                fail_silently=False,
            )
            if sent != 1:
                raise EmailUnavailable()
        except Exception as error:
            # Never log provider response bodies, message text or credentials.
            raise EmailUnavailable() from error
        AccountToken.objects.filter(user=user, purpose=purpose, consumed_at=None).exclude(
            pk=item.pk
        ).update(consumed_at=timezone.now())


def register_account(data):
    if not settings.ACCOUNT_REGISTRATION_ENABLED:
        raise EmailUnavailable("Registration is not open yet. Please try again later.")
    User = get_user_model()
    username = User.normalize_username(data["username"].strip())
    email = data["email"].strip().lower()
    if "@" in username:
        raise ValidationError(
            {"username": ["Use a username without @; your email is a separate sign-in option."]}
        )
    user = User(username=username, email=email)
    try:
        user.full_clean(exclude=["password"])
    except DjangoValidationError as error:
        raise ValidationError({"username": ["Choose a valid, available username."]}) from error
    check_password(data["password"], user)
    if (
        User.objects.filter(username__iexact=username).exists()
        or User.objects.filter(email__iexact=email).exists()
        or AccountProfile.objects.filter(email=email).exists()
    ):
        raise ValidationError(
            {
                "account": [
                    "Unable to create this account. Sign in or recover your account if you already registered."
                ]
            }
        )
    try:
        with transaction.atomic():
            user.set_password(data["password"])
            user.save()
            AccountProfile.objects.create(
                user=user,
                email=email,
                username_key=username.lower(),
                requires_verification=settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED,
            )
    except IntegrityError as error:
        raise ValidationError(
            {"account": ["Unable to create this account with those details."]}
        ) from error
    return user


def set_email(user, email):
    email = email.strip().lower()
    with transaction.atomic():
        profile = profile_for(user)
        profile = AccountProfile.objects.select_for_update().get(pk=profile.pk)
        if profile.email == email:
            return
        if profile.verified_at:
            raise ValidationError(
                {"email": ["Contact an administrator to change a verified email."]}
            )
        if get_user_model().objects.filter(email__iexact=email).exclude(pk=user.pk).exists():
            raise ValidationError(
                {
                    "email": [
                        "This address cannot be used. Recover your existing account or contact an administrator."
                    ]
                }
            )
        try:
            with transaction.atomic():
                profile.email = email
                profile.save()
        except IntegrityError as error:
            raise ValidationError(
                {
                    "email": [
                        "This address cannot be used. Recover your existing account or contact an administrator."
                    ]
                }
            ) from error
        AccountToken.objects.filter(user=user, consumed_at=None).update(consumed_at=timezone.now())
        user.email = email
        user.save(update_fields=["email"])


@transaction.atomic
def consume_link(raw, purpose, *, actor=None, password=None, email_sign_in=False):
    require_email_feature(purpose)
    digest = hashlib.sha256(raw.encode()).hexdigest()
    candidate = AccountToken.objects.filter(
        digest=digest, purpose=purpose, consumed_at=None, expires_at__gt=timezone.now()
    ).first()
    if candidate is None:
        raise ValidationError({"token": ["This link is invalid or expired. Request a new one."]})
    # Match issuance/email-change lock order: profile before token/user.
    profile = AccountProfile.objects.select_for_update().get(user_id=candidate.user_id)
    item = (
        AccountToken.objects.select_for_update()
        .filter(pk=candidate.pk, consumed_at=None, expires_at__gt=timezone.now())
        .first()
    )
    if item is None:
        raise ValidationError({"token": ["This link is invalid or expired. Request a new one."]})
    user = get_user_model().objects.select_for_update().get(pk=item.user_id)
    if not user.is_active or profile.email != item.email:
        raise ValidationError({"token": ["This link is no longer valid."]})
    if purpose == "verify":
        if (actor is None and not email_sign_in) or (actor is not None and actor.pk != user.pk):
            raise ValidationError(
                {"token": ["Sign out of the other account before using this verification link."]}
            )
        profile.verified_at = timezone.now()
        profile.save(update_fields=["verified_at"])
    else:
        if not profile.verified_at:
            raise ValidationError({"token": ["Verify your email before resetting your password."]})
        check_password(password, user)
        user.set_password(password)
        user.save(update_fields=["password"])
    AccountToken.objects.filter(user=user, purpose=purpose, consumed_at=None).update(
        consumed_at=timezone.now()
    )
    return user
