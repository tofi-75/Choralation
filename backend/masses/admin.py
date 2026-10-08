"""Administrative inspection is read-only; writes use revision-guarded app services."""

from django.contrib import admin

from accounts.permissions import Role, role_for
from masses.models import Mass, MassHymnSelection


@admin.register(Mass, MassHymnSelection)
class PlanningInspectionAdmin(admin.ModelAdmin):
    def has_view_permission(self, request, obj=None):
        return role_for(request.user) == Role.ADMIN

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
