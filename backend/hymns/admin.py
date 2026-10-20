"""Protected administrative editing uses the same mutation/locking policy as HTTP.

No bulk deletes: M2M cascades must not bypass reference protection. Form checks
give useful feedback; services recheck state under locks before committing.
"""

from django import forms
from django.contrib import admin, messages
from django.http import HttpResponseRedirect
from rest_framework.exceptions import APIException

from accounts.permissions import Role, role_for
from hymns import services
from hymns.models import CATEGORY_TYPES, RELATIONS, Hymn
from hymns.serializers import CategoryWriteSerializer, HymnWriteSerializer


def form_payload(form) -> dict:
    """Convert ModelForm relations into the same ID write contract used by React."""
    payload = {}
    for name, value in form.cleaned_data.items():
        if name == "sheet_music_pdf":
            if value is False:
                payload["remove_sheet_music_pdf"] = True
            elif value and hasattr(value, "content_type"):
                payload[name] = value
        elif name == "voices":
            payload[name] = value or []
        elif name in RELATIONS:
            payload[f"{name[:-1]}_ids"] = [row.pk for row in value]
        elif name == "language":
            payload["language_id"] = value.pk
        elif name in HymnWriteSerializer().fields:
            payload[name] = value
    return payload


class HymnForm(forms.ModelForm):
    audio_url = forms.URLField(required=False, max_length=1000, assume_scheme="https")
    sheet_music_url = forms.URLField(required=False, max_length=1000, assume_scheme="https")

    class Meta:
        model = Hymn
        exclude = ["created_by", "updated_by", "sheet_music_pdf_name"]

    def clean(self):
        cleaned = super().clean()
        serializer = HymnWriteSerializer(data=form_payload(self))
        if not serializer.is_valid():
            for name, errors in serializer.errors.items():
                field = {
                    "language_id": "language",
                    "genre_ids": "genres",
                    "season_ids": "seasons",
                    "placement_ids": "placements",
                    "tag_ids": "tags",
                }.get(name, name)
                self.add_error(field if field in self.fields else None, "; ".join(map(str, errors)))
        if not cleaned.get("is_season_neutral") and not cleaned.get("seasons"):
            self.add_error("seasons", "Choose a season or mark this hymn season-neutral.")
        for name in RELATIONS:
            rows = cleaned.get(name, [])
            previous = (
                set(getattr(self.instance, name).values_list("id", flat=True))
                if self.instance.pk
                else set()
            )
            if any(not row.is_active and row.pk not in previous for row in rows):
                self.add_error(name, "New links require active categories.")
            if (
                name == "placements"
                and {row.pk for row in rows} != previous
                and rows
                and not any(row.is_active for row in rows)
            ):
                self.add_error(name, "A changed placement set requires an active placement.")
        language = cleaned.get("language")
        if language and not language.is_active and language.pk != self.instance.language_id:
            self.add_error("language", "Choose an active language.")
        if not cleaned.get("is_polyphonic") and cleaned.get("voices"):
            self.add_error("voices", "Enable polyphony or explicitly clear the voice list.")
        return cleaned


class GuardedAdmin(admin.ModelAdmin):
    actions = None

    def has_add_permission(self, request):
        return super().has_add_permission(request) and role_for(request.user) in self.edit_roles

    def has_change_permission(self, request, obj=None):
        return (
            super().has_change_permission(request, obj)
            and role_for(request.user) in self.edit_roles
        )

    def has_delete_permission(self, request, obj=None):
        allowed = (
            super().has_delete_permission(request, obj) and role_for(request.user) == Role.ADMIN
        )
        return allowed and (obj is None or not any(services.reference_counts(obj).values()))

    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        try:
            return super().changeform_view(request, object_id, form_url, extra_context)
        except APIException as error:
            self.message_user(request, str(error.detail), level=messages.ERROR)
            return HttpResponseRedirect(request.path)

    def delete_view(self, request, object_id, extra_context=None):
        try:
            return super().delete_view(request, object_id, extra_context)
        except APIException as error:
            self.message_user(request, str(error.detail), level=messages.ERROR)
            return HttpResponseRedirect(request.path)


class CategoryAdmin(GuardedAdmin):
    edit_roles = {Role.ADMIN}
    list_display = ["name", "is_active", "display_order", "slug"]
    list_filter = ["is_active"]
    search_fields = ["name"]
    readonly_fields = ["slug", "created_at", "updated_at"]

    def save_model(self, request, obj, form, change):
        data = {
            name: form.cleaned_data[name]
            for name in ("name", "description", "display_order", "is_active")
        }
        serializer = CategoryWriteSerializer(data=data, partial=change)
        serializer.is_valid(raise_exception=True)
        saved = services.save_category(
            type(obj), serializer.validated_data, request.user, obj.pk if change else None
        )
        obj.__dict__.update(saved.__dict__)

    def delete_model(self, request, obj):
        services.delete_category(type(obj), obj.pk, request.user)


@admin.register(Hymn)
class HymnAdmin(GuardedAdmin):
    form = HymnForm
    edit_roles = {Role.ADMIN, Role.PLANNER}
    list_display = ["title", "language", "is_active", "updated_at"]
    list_filter = ["is_active", "language"]
    search_fields = ["title", "latin_title", "alternate_title", "composer", "source_or_hymnal"]
    filter_horizontal = ["genres", "seasons", "placements", "tags"]
    readonly_fields = [
        "created_by",
        "updated_by",
        "created_at",
        "updated_at",
        "sheet_music_pdf_name",
    ]

    def get_readonly_fields(self, request, obj=None):
        return [
            *self.readonly_fields,
            *([] if role_for(request.user) == Role.ADMIN else ["is_active"]),
        ]

    def save_model(self, request, obj, form, change):
        serializer = HymnWriteSerializer(data=form_payload(form), partial=change)
        serializer.is_valid(raise_exception=True)
        saved = services.save_hymn(
            serializer.validated_data, request.user, obj.pk if change else None
        )
        obj.__dict__.update(saved.__dict__)

    def delete_model(self, request, obj):
        services.delete_hymn(obj.pk, request.user)


for model in CATEGORY_TYPES.values():
    admin.site.register(model, CategoryAdmin)
