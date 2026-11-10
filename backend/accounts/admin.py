from django.contrib import admin

from accounts.manager_requests import set_choir_creation_permission
from accounts.models import AccountProfile
from accounts.permissions import AdminPermission


@admin.register(AccountProfile)
class AccountProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "email", "verified_at", "can_create_choirs"]
    search_fields = ["user__username", "email"]
    readonly_fields = ["user", "email", "username_key", "verified_at", "requires_verification"]

    def get_readonly_fields(self, request, obj=None):
        fields = super().get_readonly_fields(request, obj)
        if not AdminPermission().has_permission(request, self):
            return [*fields, "can_create_choirs"]
        return fields

    def save_model(self, request, obj, form, change):
        fields = set(form.changed_data)
        if "can_create_choirs" in fields:
            set_choir_creation_permission(request.user, obj.user.username, obj.can_create_choirs)
            fields.remove("can_create_choirs")
        if fields:
            obj.save(update_fields=fields)

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
