"""Choir calendar configuration is independent of saved Mass metadata."""

from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError, available_timezones

from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import VerifiedPermission
from accounts.serializers import StrictSerializer
from choirs.access import require_choir
from choirs.models import CalendarOverride, CalendarSettings
from hymns.models import LiturgicalSeason
from hymns.services import SettingsConflict


class CalendarWrite(StrictSerializer):
    calendar = serializers.ChoiceField(choices=["maronite", "manual"])
    time_zone = serializers.CharField(max_length=64)
    version = serializers.IntegerField(min_value=0)

    def validate_time_zone(self, value):
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as error:
            raise serializers.ValidationError("Choose a valid IANA timezone.") from error
        return value


class OverrideWrite(StrictSerializer):
    date = serializers.DateField()
    season_id = serializers.IntegerField(min_value=1, allow_null=True)
    version = serializers.IntegerField(min_value=0)

    def validate_date(self, value):
        if not 1900 <= value.year <= 2199:
            raise serializers.ValidationError("Use a date between 1900 and 2199.")
        return value


class OverrideRead(serializers.Serializer):
    date = serializers.DateField()
    season_id = serializers.IntegerField()
    season_name = serializers.CharField()
    is_active = serializers.BooleanField()


class CalendarRead(serializers.Serializer):
    calendar = serializers.CharField()
    time_zone = serializers.CharField()
    version = serializers.IntegerField()
    overrides = OverrideRead(many=True)
    time_zones = serializers.ListField(child=serializers.CharField())


def config_for(choir_id):
    return CalendarSettings.objects.filter(choir_id=choir_id).first()


def choir_zone(choir_id):
    config = config_for(choir_id) if choir_id else None
    return ZoneInfo(config.time_zone if config else "Asia/Beirut")


def calendar_context(zone):
    day = timezone.localdate(timezone=ZoneInfo(zone))
    weekday = (day.weekday() + 1) % 7
    return {
        "time_zone": zone,
        "today": day.isoformat(),
        "default_mass_date": (
            day + timedelta(days=-weekday if weekday <= 3 else 7 - weekday)
        ).isoformat(),
    }


def default_mass_date(zone):
    return calendar_context(zone)["default_mass_date"]


def payload(choir_id):
    config = config_for(choir_id)
    return {
        "calendar": config.calendar if config else "maronite",
        "time_zone": config.time_zone if config else "Asia/Beirut",
        "version": config.version if config else 0,
        "overrides": [
            {
                "date": row.date,
                "season_id": row.season_id,
                "season_name": row.season.name,
                "is_active": row.season.is_active,
            }
            for row in CalendarOverride.objects.filter(choir_id=choir_id).select_related("season")
        ],
        "time_zones": sorted(available_timezones()),
    }


@transaction.atomic
def change(actor, choir_id, data, override=False):
    choir = require_choir(actor, choir_id, planner=True, lock=True)
    config, _ = CalendarSettings.objects.get_or_create(choir=choir)
    if config.version != data["version"]:
        raise SettingsConflict()
    if override:
        season_id = data["season_id"]
        if season_id is None:
            CalendarOverride.objects.filter(choir=choir, date=data["date"]).delete()
        else:
            season = (
                LiturgicalSeason.objects.select_for_update()
                .filter(pk=season_id, is_active=True)
                .first()
            )
            if season is None:
                raise serializers.ValidationError({"season_id": ["Choose an active season."]})
            CalendarOverride.objects.update_or_create(
                choir=choir, date=data["date"], defaults={"season": season}
            )
    else:
        config.calendar, config.time_zone = data["calendar"], data["time_zone"]
    config.version += 1
    config.save()
    return payload(choir.pk)


class CalendarSettingsView(APIView):
    permission_classes = [VerifiedPermission]

    @extend_schema(responses=CalendarRead)
    def get(self, request, choir_id):
        require_choir(request.user, choir_id)
        return Response(payload(choir_id))

    @extend_schema(request=CalendarWrite, responses=CalendarRead)
    def patch(self, request, choir_id):
        data = CalendarWrite(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(change(request.user, choir_id, data.validated_data))


class CalendarOverrideView(APIView):
    permission_classes = [VerifiedPermission]

    @extend_schema(request=OverrideWrite, responses=CalendarRead)
    def post(self, request, choir_id):
        data = OverrideWrite(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(change(request.user, choir_id, data.validated_data, override=True))
