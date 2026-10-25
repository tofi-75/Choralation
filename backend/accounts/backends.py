"""Username or unique verified email, retaining Django password/session semantics."""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.backends import ModelBackend

from accounts.models import AccountProfile


class EmailOrUsernameBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        if username is None or password is None:
            return None
        User = get_user_model()
        users = list(User.objects.filter(username=username)[:2])
        profiles = AccountProfile.objects.filter(email=username.strip().lower())
        if settings.ACCOUNT_EMAIL_VERIFICATION_ENABLED:
            profiles = profiles.filter(verified_at__isnull=False)
        email_ids = profiles.values_list("user_id", flat=True)
        users = {u.pk: u for u in [*users, *User.objects.filter(pk__in=email_ids)]}
        if len(users) == 1:
            user = next(iter(users.values()))
            if user.check_password(password) and self.user_can_authenticate(user):
                return user
        else:
            User().set_password(password)
        return None
