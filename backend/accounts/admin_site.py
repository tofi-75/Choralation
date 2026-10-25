from django.conf import settings
from django.contrib.admin import AdminSite
from django.shortcuts import redirect

from accounts.permissions import verified_access


class VerifiedAdminSite(AdminSite):
    """Activating verification also closes existing Django-admin sessions."""

    def has_permission(self, request):
        return super().has_permission(request) and verified_access(request.user)

    def login(self, request, extra_context=None):
        if (
            request.user.is_authenticated
            and request.user.is_staff
            and not verified_access(request.user)
        ):
            return redirect(settings.APP_PUBLIC_URL + "/verify-email")
        return super().login(request, extra_context)
