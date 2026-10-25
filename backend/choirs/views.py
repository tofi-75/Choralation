from django.db import transaction
from django.db.models import Count, F
from drf_spectacular.utils import extend_schema
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound
from rest_framework.response import Response

from accounts.permissions import VerifiedPermission
from accounts.security import limit
from accounts.serializers import EmptySerializer
from choirs import services
from choirs.access import is_admin, require_choir, visible_choirs
from choirs.models import Choir, JoinCode, JoinRequest, Membership
from choirs.serializers import (
    ApplicationSerializer,
    ChoirDetailSerializer,
    ChoirSerializer,
    ChoirWriteSerializer,
    CodeSerializer,
    ConfirmSerializer,
    DecisionSerializer,
    DirectorySerializer,
    JoinSerializer,
    MemberSerializer,
    RequestResultSerializer,
)
from hymns.selectors import LibraryPagination


def summary(choir, user, *, outsider=False):
    role = (
        None
        if outsider
        else Membership.objects.filter(choir=choir, user=user)
        .values_list("role", flat=True)
        .first()
    )
    return {
        "id": choir.pk,
        "name": choir.name,
        "description": choir.description,
        "is_public": choir.is_public,
        "show_member_count": choir.show_member_count,
        "member_count": choir.memberships.count()
        if choir.show_member_count or role or is_admin(user)
        else None,
        "role": "Planner" if is_admin(user) and not outsider else role,
    }


def summaries(rows, user, *, outsider=False):
    """Directory/list serialization uses fixed queries, never one per choir."""
    rows = list(rows)
    admin = is_admin(user) if not outsider else False
    roles = (
        {}
        if outsider
        else dict(
            Membership.objects.filter(user=user, choir__in=rows).values_list("choir_id", "role")
        )
    )
    return [
        {
            "id": c.pk,
            "name": c.name,
            "description": c.description,
            "is_public": c.is_public,
            "show_member_count": c.show_member_count,
            "member_count": c.total_members
            if c.show_member_count or roles.get(c.pk) or admin
            else None,
            "role": "Planner" if admin else roles.get(c.pk),
        }
        for c in rows
    ]


class ChoirViewSet(viewsets.GenericViewSet):
    permission_classes = [VerifiedPermission]
    serializer_class = ChoirSerializer
    queryset = Choir.objects.none()
    lookup_value_regex = r"[1-9][0-9]{0,17}"
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def list(self, request):
        return Response(
            summaries(
                visible_choirs(request.user)
                .annotate(total_members=Count("memberships"))
                .order_by("created_at", "id"),
                request.user,
            )
        )

    @extend_schema(request=ChoirWriteSerializer, responses={201: ChoirSerializer})
    def create(self, request):
        data = ChoirWriteSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response(
            summary(services.create_choir(request.user, data.validated_data), request.user),
            status=201,
        )

    @extend_schema(responses={200: ChoirDetailSerializer})
    def retrieve(self, request, pk=None):
        choir = require_choir(request.user, pk)
        data = summary(choir, request.user)
        data["members"] = list(
            choir.memberships.order_by("user__username", "id").values(
                "id", "user_id", "role", username=F("user__username")
            )
        )
        if data["role"] == "Planner":
            data["code"] = choir.codes.get(is_active=True).code
            data["requests"] = list(
                choir.join_requests.filter(status="pending")
                .order_by("created_at", "id")
                .values("id", "status", username=F("user__username"))
            )
        return Response(data)

    @extend_schema(request=ChoirWriteSerializer)
    @transaction.atomic
    def partial_update(self, request, pk=None):
        choir = require_choir(request.user, pk, planner=True, lock=True)
        data = ChoirWriteSerializer(data=request.data, partial=True)
        data.is_valid(raise_exception=True)
        for key, value in data.validated_data.items():
            setattr(choir, key, value)
        choir.save()
        return Response(summary(choir, request.user))

    @extend_schema(responses={200: DirectorySerializer})
    @action(detail=False, methods=["get"])
    def directory(self, request):
        q = request.query_params.get("q", "").strip()[:150]
        rows = (
            Choir.objects.filter(is_public=True, name__icontains=q)
            .annotate(total_members=Count("memberships"))
            .order_by("name", "id")
        )
        paginator = LibraryPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response(summaries(page, request.user, outsider=True))

    @extend_schema(request=CodeSerializer, responses={200: ChoirSerializer})
    @action(detail=False, methods=["post"], url_path="lookup-code")
    def lookup_code(self, request):
        limit("choir-lookup", request.user.pk, 10, 900)
        data = CodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        code = (
            JoinCode.objects.select_related("choir")
            .filter(code=data.validated_data["code"], is_active=True)
            .first()
        )
        if code is None:
            raise NotFound("No choir matches this code.")
        return Response(summary(code.choir, request.user, outsider=True))

    @extend_schema(
        methods=["POST"], request=JoinSerializer, responses={201: RequestResultSerializer}
    )
    @extend_schema(methods=["GET"], responses={200: ApplicationSerializer(many=True)})
    @action(detail=False, methods=["get", "post"], url_path="requests")
    def requests(self, request):
        if request.method == "GET":
            return Response(
                [
                    {
                        "id": r.pk,
                        "choir_id": r.choir_id,
                        "choir_name": r.choir.name,
                        "status": r.status,
                    }
                    for r in JoinRequest.objects.filter(user=request.user)
                    .select_related("choir")
                    .order_by("-updated_at")
                ]
            )
        limit("choir-request", request.user.pk, 20, 3600)
        data = JoinSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        values = data.validated_data
        code = values.get("code", "").strip().upper().replace(" ", "").replace("-", "")
        item = services.request_join(request.user, values["choir_id"], code)
        return Response({"id": item.pk, "status": item.status}, status=201)

    @extend_schema(request=EmptySerializer, responses={204: None})
    @action(
        detail=False, methods=["post"], url_path=r"requests/(?P<request_id>[1-9][0-9]{0,17})/cancel"
    )
    @transaction.atomic
    def cancel(self, request, request_id=None):
        EmptySerializer(data=request.data).is_valid(raise_exception=True)
        item = (
            JoinRequest.objects.select_for_update()
            .filter(pk=request_id, user=request.user, status="pending")
            .first()
        )
        if item is None:
            raise NotFound("Pending request not found.")
        item.status = "cancelled"
        item.save()
        return Response(status=204)

    @extend_schema(request=ConfirmSerializer, responses={200: CodeSerializer})
    @action(detail=True, methods=["post"], url_path="regenerate-code")
    def regenerate_code(self, request, pk=None):
        data = ConfirmSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        return Response({"code": services.regenerate(request.user, pk).code})

    @extend_schema(request=DecisionSerializer, responses={204: None})
    @action(
        detail=True, methods=["post"], url_path=r"requests/(?P<request_id>[1-9][0-9]{0,17})/decide"
    )
    def decide(self, request, pk=None, request_id=None):
        data = DecisionSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.decide(request.user, pk, request_id, data.validated_data["status"])
        return Response(status=204)

    @extend_schema(request=MemberSerializer, responses={204: None})
    @action(
        detail=True,
        methods=["patch", "delete"],
        url_path=r"members/(?P<member_id>[1-9][0-9]{0,17})",
    )
    def member(self, request, pk=None, member_id=None):
        role = None
        if request.method == "PATCH":
            data = MemberSerializer(data=request.data)
            data.is_valid(raise_exception=True)
            role = data.validated_data["role"]
        services.change_member(request.user, pk, member_id, role)
        return Response(status=204)
