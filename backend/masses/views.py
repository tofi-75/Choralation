"""HTTP adapters for revision-guarded planning/lifecycle and saved program history."""

from django.db import transaction
from drf_spectacular.utils import OpenApiParameter, extend_schema, extend_schema_view
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import AdminPermission, PlannerPermission
from accounts.serializers import EmptySerializer, ErrorSerializer
from hymns.selectors import LibraryPagination
from masses import selectors, services
from masses.random_picker import random_picks
from masses.serializers import (
    MassHistorySerializer,
    MassListSerializer,
    MassReadSerializer,
    MassWriteSerializer,
    ProgramReadSerializer,
    ProgramWriteSerializer,
    RandomPickRequestSerializer,
    RandomPicksSerializer,
)

ERRORS = {code: ErrorSerializer for code in (400, 403, 404, 409, 412, 428)}
REVISION = [
    OpenApiParameter("X-Expected-Mass-Revision", str, OpenApiParameter.HEADER, required=True)
]


@extend_schema_view(
    list=extend_schema(
        responses={200: MassListSerializer(many=True), **ERRORS},
        parameters=[
            OpenApiParameter(name, str)
            for name in ("from", "to", "status", "season", "q", "archived")
        ],
    ),
    retrieve=extend_schema(responses={200: MassReadSerializer, **ERRORS}),
    create=extend_schema(
        request=MassWriteSerializer, responses={201: MassReadSerializer, **ERRORS}
    ),
    partial_update=extend_schema(
        request=MassWriteSerializer,
        parameters=REVISION,
        responses={200: MassReadSerializer, **ERRORS},
    ),
    destroy=extend_schema(parameters=REVISION, responses={204: None, **ERRORS}),
)
class MassViewSet(viewsets.GenericViewSet):
    serializer_class = MassReadSerializer
    pagination_class = LibraryPagination
    http_method_names = ["get", "post", "patch", "put", "delete", "head", "options"]

    def get_queryset(self):
        return selectors.mass_queryset()

    def get_permissions(self):
        policy = (
            AdminPermission
            if self.action == "destroy"
            else PlannerPermission
            if self.action
            in {"create", "partial_update", "program", "random_picks", "finalize", "reopen"}
            else IsAuthenticated
        )
        return [policy()]

    def list(self, request):
        page = self.paginate_queryset(selectors.mass_list(request.query_params))
        return self.get_paginated_response(MassListSerializer(page, many=True).data)

    @extend_schema(
        responses={200: MassHistorySerializer(many=True), **ERRORS},
        parameters=[
            OpenApiParameter(name, str)
            for name in ("from", "to", "status", "season", "q", "archived")
        ],
    )
    @action(detail=False, methods=["get"])
    def history(self, request):
        page = self.paginate_queryset(selectors.mass_history(request.query_params))
        return self.get_paginated_response(MassHistorySerializer(page, many=True).data)

    @extend_schema(
        request=EmptySerializer, parameters=REVISION, responses={200: MassReadSerializer, **ERRORS}
    )
    @action(detail=True, methods=["post"])
    def finalize(self, request, pk=None):
        return self.transition(request, self.get_object().pk, reopen=False)

    @extend_schema(
        request=EmptySerializer, parameters=REVISION, responses={200: MassReadSerializer, **ERRORS}
    )
    @action(detail=True, methods=["post"])
    def reopen(self, request, pk=None):
        return self.transition(request, self.get_object().pk, reopen=True)

    @transaction.atomic
    def transition(self, request, pk, *, reopen):
        serializer = EmptySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.transition_mass(
            pk, request.user, request.headers.get("X-Expected-Mass-Revision"), reopen=reopen
        )
        return self.detail_response(pk)

    def detail_response(self, pk, status=200):
        mass = self.get_queryset().get(pk=pk)
        return Response(
            MassReadSerializer(mass).data,
            status=status,
            headers={"X-Mass-Revision": str(mass.revision)},
        )

    def retrieve(self, request, pk=None):
        return self.detail_response(self.get_object().pk)

    def create(self, request):
        return self.save(request, status=201)

    def partial_update(self, request, pk=None):
        return self.save(request, self.get_object().pk)

    @transaction.atomic
    def save(self, request, pk=None, status=200):
        serializer = MassWriteSerializer(data=request.data, partial=pk is not None)
        serializer.is_valid(raise_exception=True)
        mass = services.save_mass(
            serializer.validated_data,
            request.user,
            pk,
            request.headers.get("X-Expected-Mass-Revision"),
        )
        return self.detail_response(mass.pk, status)

    @extend_schema(
        request=ProgramWriteSerializer,
        parameters=REVISION,
        responses={200: ProgramReadSerializer, **ERRORS},
    )
    @action(detail=True, methods=["put"])
    @transaction.atomic
    def program(self, request, pk=None):
        instance = self.get_object()
        serializer = ProgramWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.save_program(
            instance.pk,
            serializer.validated_data["selections"],
            request.user,
            request.headers.get("X-Expected-Mass-Revision"),
        )
        mass = self.get_queryset().get(pk=instance.pk)
        return Response(
            {
                "mass_id": mass.pk,
                "revision": mass.revision,
                "selections": MassReadSerializer(mass).data["program"],
                "warnings": selectors.program_warnings(mass),
            },
            headers={"X-Mass-Revision": str(mass.revision)},
        )

    @extend_schema(
        request=RandomPickRequestSerializer,
        responses={200: RandomPicksSerializer, **ERRORS},
        description="Read-only random suggestions; insert via revision-guarded program PUT.",
    )
    @action(detail=True, methods=["post"], url_path="random-picks")
    def random_picks(self, request, pk=None):
        instance = self.get_object()
        if instance.status != "draft":
            raise services.MassFinalized()
        serializer = RandomPickRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = random_picks(**serializer.validated_data)
        return Response(RandomPicksSerializer(result).data)

    def destroy(self, request, pk=None):
        services.delete_mass(
            self.get_object().pk, request.user, request.headers.get("X-Expected-Mass-Revision")
        )
        return Response(status=204)
