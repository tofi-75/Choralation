from django.contrib import admin

from accounts.models import AccountProfile


@admin.register(AccountProfile)
class AccountProfileAdmin(admin.ModelAdmin):
    list_display = ["user", "email", "verified_at", "can_create_choirs"]
    search_fields = ["user__username", "email"]
    readonly_fields = ["user", "email", "username_key", "verified_at", "requires_verification"]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
