"""Read-only diagnostics; the public API cannot start, stop, or unlock releases."""

from django.conf import settings
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import Role, role_for
from common.models import OperationsState


class OperationsSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()
    read_only = serializers.BooleanField()
    reason = serializers.CharField()
    started_at = serializers.DateTimeField(allow_null=True)
    admin = serializers.JSONField(required=False)


class OperationsStatusView(APIView):
    @extend_schema(responses=OperationsSerializer)
    def get(self, request):
        enabled = settings.PRODUCTION_OPERATIONS_ENABLED
        state = OperationsState.objects.get(pk=1)
        body = {
            "enabled": enabled,
            "read_only": enabled and state.read_only,
            "reason": state.reason if enabled and state.read_only else "",
            "started_at": state.started_at if enabled and state.read_only else None,
        }
        if role_for(request.user) == Role.ADMIN:
            stamp = state.last_backup.get("created_at")
            age = None
            if stamp:
                from datetime import datetime

                age = max(0, (timezone.now() - datetime.fromisoformat(stamp)).total_seconds())
            body["admin"] = {
                "phase": state.phase,
                "operation_id": state.operation_id,
                "backup_age_seconds": age,
                "backup_stale": age is None or age > 86400,
                "last_backup": state.last_backup,
                "last_release": state.last_release,
                "last_restore": state.last_restore,
            }
        return Response(body)
