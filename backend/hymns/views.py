"""Thin HTTP adapters; shared services enforce permissions/transactions again."""

import json

from botocore.exceptions import BotoCoreError, ClientError
from django.http import FileResponse
from drf_spectacular.utils import OpenApiParameter, OpenApiTypes, extend_schema, extend_schema_view
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.response import Response

from accounts.permissions import AdminPermission, Role, VerifiedPermission, role_for
from accounts.security import limit
from accounts.serializers import ErrorSerializer
from choirs.access import request_choir, require_choir
from common.storage import StorageUnavailable
from hymns import selectors, services
from hymns.models import Hymn
from hymns.serializers import (
    CategoryDetailSerializer,
    CategoryReadSerializer,
    CategoryReorderResponseSerializer,
    CategoryWriteSerializer,
    HymnMultipartWriteSerializer,
    HymnReadSerializer,
    HymnReviewSerializer,
    HymnSubmitSerializer,
    HymnWriteSerializer,
    ReorderSerializer,
)
from masses.selectors import hymn_usage
from masses.serializers import HymnUsageSerializer

ERRORS = {400: ErrorSerializer, 403: ErrorSerializer, 404: ErrorSerializer, 409: ErrorSerializer}


@extend_schema(
    parameters=[
        OpenApiParameter(
            "X-Choir-ID",
            int,
            OpenApiParameter.HEADER,
            required=False,
            description="Selected choir for usage counts, dates and usage filters; membership is required when supplied.",
        )
    ]
)
@extend_schema_view(
    list=extend_schema(
        responses={200: HymnReadSerializer(many=True), **ERRORS},
        parameters=[
            OpenApiParameter(
                name, str, description="Comma-separated IDs; OR within this dimension."
            )
            for name in selectors.FILTER_TYPES
        ]
        + [
            OpenApiParameter("q", str, description="Literal substring of metadata or tag names."),
            OpenApiParameter("is_active", str, enum=["true", "false", "all"]),
            OpenApiParameter(
                "ordering",
                str,
                enum=selectors.LIBRARY_ORDERINGS,
            ),
            OpenApiParameter(
                "preferred_season",
                int,
                description="Season matches and neutral hymns first; preserves other results and the selected secondary ordering.",
            ),
        ]
        + [OpenApiParameter(name, str) for name in sorted(selectors.USAGE_PARAMS)],
    ),
    retrieve=extend_schema(responses={200: HymnReadSerializer, **ERRORS}),
    create=extend_schema(
        request={
            "application/json": HymnWriteSerializer,
            "multipart/form-data": HymnMultipartWriteSerializer,
        },
        responses={201: HymnReadSerializer, 503: ErrorSerializer, **ERRORS},
    ),
    partial_update=extend_schema(
        request={
            "application/json": HymnWriteSerializer,
            "multipart/form-data": HymnMultipartWriteSerializer,
        },
        responses={200: HymnReadSerializer, 503: ErrorSerializer, **ERRORS},
    ),
    destroy=extend_schema(responses={204: None, **ERRORS}),
)
class HymnViewSet(viewsets.GenericViewSet):
    serializer_class = HymnReadSerializer
    pagination_class = selectors.LibraryPagination
    parser_classes = [JSONParser, MultiPartParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return selectors.visible_hymns(
            self.request.user, request_choir(self.request, required=False)
        )

    def get_permissions(self):
        return [VerifiedPermission()]

    def list(self, request):
        rows = selectors.library_queryset(
            request.query_params, request_choir(request, required=False)
        )
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(self.get_serializer(self.get_object()).data)

    @extend_schema(responses={200: HymnReadSerializer(many=True)})
    @action(detail=False, methods=["get"], url_path="mine")
    def mine(self, request):
        selectors.validate_query(request.query_params, {"page", "page_size"})
        rows = self.get_queryset().filter(created_by=request.user).order_by("-updated_at", "-id")
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @extend_schema(responses={200: HymnReadSerializer(many=True)})
    @action(detail=False, methods=["get"], url_path="review-queue")
    def review_queue(self, request):
        selectors.validate_query(request.query_params, {"page", "page_size", "choir_id"})
        rows = (
            self.get_queryset()
            .filter(publication_status="pending", can_review_submission=True)
            .order_by("updated_at", "id")
        )
        choir_id = request.query_params.get("choir_id")
        if choir_id is not None:
            if (
                not choir_id.isascii()
                or not choir_id.isdigit()
                or len(choir_id) > 18
                or int(choir_id) < 1
            ):
                raise ValidationError({"choir_id": ["Choose a valid choir."]})
            require_choir(request.user, int(choir_id), planner=True)
            rows = rows.filter(submitted_to_id=int(choir_id))
        page = self.paginate_queryset(rows)
        return self.get_paginated_response(self.get_serializer(page, many=True).data)

    @extend_schema(request=HymnSubmitSerializer, responses={200: HymnReadSerializer, **ERRORS})
    @action(detail=True, methods=["post"], url_path="submit")
    def submit(self, request, pk=None):
        limit("hymn-submit", request.user.pk, 10, 3600)
        self.get_object()
        data = HymnSubmitSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        services.submit_hymn(request.user, int(pk), **data.validated_data)
        return Response(self.get_serializer(self.get_object()).data)

    @extend_schema(request=HymnReviewSerializer, responses={200: HymnReadSerializer, **ERRORS})
    @action(detail=True, methods=["post"], url_path="review")
    def review(self, request, pk=None):
        self.get_object()
        data = HymnReviewSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        hymn = services.review_hymn(request.user, int(pk), **data.validated_data)
        # Declining ends the reviewer's ongoing access; return this authorized action's result without another visibility lookup.
        updated = selectors.hymn_queryset(rows=Hymn.all_objects.filter(pk=hymn.pk)).get()
        return Response(self.get_serializer(updated).data)

    @extend_schema(
        responses={200: HymnUsageSerializer(many=True), **ERRORS},
        parameters=[OpenApiParameter("X-Choir-ID", int, OpenApiParameter.HEADER, required=True)]
        + [OpenApiParameter(name, str) for name in ("from", "to", "season", "q")],
    )
    @action(detail=True, methods=["get"])
    def usage(self, request, pk=None):
        page = self.paginate_queryset(
            hymn_usage(self.get_object().pk, request.query_params, request_choir(request))
        )
        return self.get_paginated_response(HymnUsageSerializer(page, many=True).data)

    def create(self, request):
        return self.save(request, status=201)

    def partial_update(self, request, pk=None):
        self.get_object()
        return self.save(request, pk=int(pk))

    def save(self, request, pk=None, status=200):
        if role_for(request.user) == Role.VIEWER:
            limit("member-hymn-write", request.user.pk, 60, 3600)
        # Reject an invalid context before persisting shared metadata or a PDF.
        request_choir(request, required=False)
        data = request.data
        if request.content_type.startswith("multipart/form-data"):
            # JSON metadata keeps arrays/booleans typed; reject duplicate envelope parts.
            if any(
                name not in {"data", "sheet_music_pdf"} or len(data.getlist(name)) != 1
                for name in data
            ):
                raise ValidationError(
                    {"non_field_errors": ["Supply data and at most one PDF file."]}
                )
            try:
                data = json.loads(request.data.get("data", ""))
            except (ValueError, TypeError) as error:
                raise ValidationError(
                    {"data": ["Supply hymn metadata as a JSON object."]}
                ) from error
            if not isinstance(data, dict):
                raise ValidationError({"data": ["Supply hymn metadata as a JSON object."]})
            if "sheet_music_pdf" in request.data:
                data["sheet_music_pdf"] = request.data["sheet_music_pdf"]
        serializer = HymnWriteSerializer(data=data, partial=pk is not None)
        serializer.is_valid(raise_exception=True)
        hymn = services.save_hymn(serializer.validated_data, request.user, pk)
        hymn = self.get_queryset().get(pk=hymn.pk)
        return Response(self.get_serializer(hymn).data, status=status)

    @extend_schema(
        responses={
            (200, "application/pdf"): OpenApiTypes.BINARY,
            503: ErrorSerializer,
            403: ErrorSerializer,
            404: ErrorSerializer,
        }
    )
    @action(detail=True, methods=["get"], url_path="sheet-music")
    def sheet_music(self, request, pk=None):
        """Authenticated attachment download; storage paths are never exposed."""
        hymn = self.get_object()
        if not hymn.sheet_music_pdf:
            raise NotFound("No sheet music PDF is attached to this hymn.")
        try:
            handle = hymn.sheet_music_pdf.open("rb")
        except FileNotFoundError as error:
            raise NotFound("The sheet music file is unavailable.") from error
        except (BotoCoreError, ClientError) as error:
            raise StorageUnavailable() from error
        response = FileResponse(
            handle,
            as_attachment=True,
            filename=hymn.sheet_music_pdf_name,
            content_type="application/pdf",
        )
        response["X-Content-Type-Options"] = "nosniff"
        return response

    def destroy(self, request, pk=None):
        instance = self.get_object()
        services.delete_hymn(instance.pk, request.user)
        return Response(status=204)


@extend_schema_view(
    list=extend_schema(
        responses={200: CategoryReadSerializer(many=True), **ERRORS},
        parameters=[OpenApiParameter("is_active", str, enum=["true", "false", "all"])],
    ),
    retrieve=extend_schema(responses={200: CategoryDetailSerializer, **ERRORS}),
    create=extend_schema(
        request=CategoryWriteSerializer, responses={201: CategoryDetailSerializer, **ERRORS}
    ),
    partial_update=extend_schema(
        request=CategoryWriteSerializer, responses={200: CategoryDetailSerializer, **ERRORS}
    ),
    destroy=extend_schema(responses={204: None, **ERRORS}),
)
class CategoryViewSet(viewsets.GenericViewSet):
    """Unpaginated classification choices; default active, deterministic order."""

    model = None
    serializer_class = CategoryReadSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self):
        return self.model.objects.all()

    def get_permissions(self):
        return [VerifiedPermission() if self.action in {"list", "retrieve"} else AdminPermission()]

    def list(self, request):
        selectors.validate_query(request.query_params, {"is_active"})
        rows = selectors.active_filter(
            self.get_queryset(), request.query_params.get("is_active", "true")
        )
        return Response(CategoryReadSerializer(rows, many=True).data)

    def retrieve(self, request, pk=None):
        return Response(
            CategoryDetailSerializer(self.get_object(), context={"request": request}).data
        )

    def create(self, request):
        return self.save(request, status=201)

    def partial_update(self, request, pk=None):
        self.get_object()
        return self.save(request, pk=int(pk))

    def save(self, request, pk=None, status=200):
        serializer = CategoryWriteSerializer(data=request.data, partial=pk is not None)
        serializer.is_valid(raise_exception=True)
        row = services.save_category(self.model, serializer.validated_data, request.user, pk)
        return Response(CategoryDetailSerializer(row).data, status=status)

    def destroy(self, request, pk=None):
        services.delete_category(self.model, self.get_object().pk, request.user)
        return Response(status=204)

    @extend_schema(
        request=ReorderSerializer, responses={200: CategoryReorderResponseSerializer, **ERRORS}
    )
    @action(detail=False, methods=["post"])
    def reorder(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        rows = services.reorder_categories(
            self.model, serializer.validated_data["ordered_ids"], request.user
        )
        return Response({"results": CategoryReadSerializer(rows, many=True).data})
