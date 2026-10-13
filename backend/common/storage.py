"""Generic, retryable storage errors; provider details stay out of API responses."""

from rest_framework.exceptions import APIException


class StorageUnavailable(APIException):
    status_code = 503
    default_code = "storage_unavailable"
    default_detail = "Sheet music storage is temporarily unavailable. Please try again."
