from django.contrib.admin.apps import AdminConfig


class VerifiedAdminConfig(AdminConfig):
    default_site = "accounts.admin_site.VerifiedAdminSite"
