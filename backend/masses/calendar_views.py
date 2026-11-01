"""Authenticated, read-only date suggestions; never mutate a saved Mass implicitly."""

from django.utils import timezone
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from choirs.access import request_choir
from choirs.calendar_settings import choir_zone, config_for
from choirs.models import CalendarOverride
from hymns.models import LiturgicalSeason
from hymns.selectors import validate_query
from masses.calendar import FEED_URL, MARONITE_SEASONS, feed_title, local_season, title_season


class CalendarQuery(serializers.Serializer):
    date = serializers.DateField()

    def validate_date(self, value):
        if not 1900 <= value.year <= 2199:
            raise serializers.ValidationError("Use a calendar date between 1900 and 2199.")
        return value


class CalendarSuggestion(serializers.Serializer):
    date = serializers.DateField()
    calendar = serializers.CharField()
    season_slug = serializers.CharField()
    season_name = serializers.CharField()
    season_id = serializers.IntegerField(allow_null=True)
    day_title = serializers.CharField(allow_null=True)
    source = serializers.ChoiceField(choices=["evangelizo", "local", "override", "manual"])
    source_url = serializers.CharField(allow_blank=True)


class MaroniteCalendarView(APIView):
    @extend_schema(
        parameters=[
            CalendarQuery,
            OpenApiParameter("X-Choir-ID", int, OpenApiParameter.HEADER, required=False),
        ],
        responses=CalendarSuggestion,
    )
    def get(self, request):
        validate_query(request.query_params, {"date"})
        query = CalendarQuery(data=request.query_params)
        query.is_valid(raise_exception=True)
        day = query.validated_data["date"]
        choir_id = request_choir(request, required=False)
        config = config_for(choir_id) if choir_id else None
        override = (
            CalendarOverride.objects.filter(choir_id=choir_id, date=day)
            .select_related("season")
            .first()
            if choir_id
            else None
        )
        if override or (config and config.calendar == "manual"):
            season = override.season if override else None
            return Response(
                {
                    "date": day,
                    "calendar": config.calendar if config else "maronite",
                    "season_slug": season.slug if season else "",
                    "season_name": season.name if season else "Manual selection",
                    "season_id": season.pk if season and season.is_active else None,
                    "day_title": None,
                    "source": "override" if override else "manual",
                    "source_url": "",
                }
            )
        with timezone.override(choir_zone(choir_id)):
            title = feed_title(day)
        slug = (title_season(title) if title else None) or local_season(day)
        season = LiturgicalSeason.objects.filter(slug=slug, is_active=True).first()
        return Response(
            {
                "date": day,
                "calendar": "maronite",
                "season_slug": slug,
                "season_name": season.name if season else MARONITE_SEASONS[slug],
                "season_id": season.pk if season else None,
                "day_title": title,
                "source": "evangelizo" if title else "local",
                "source_url": FEED_URL
                if title
                else "https://www.maronitemusic.org/2-uncategorised",
            }
        )
