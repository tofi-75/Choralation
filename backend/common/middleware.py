"""Prevent browser/proxy caches from storing user-specific API/session responses."""

from django.utils.cache import patch_vary_headers


class PrivateResponseMiddleware:
    """Apply no-store to API responses, including auth and schema failures."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if request.path.startswith("/api/"):
            response["Cache-Control"] = "no-store"
            patch_vary_headers(response, ("Cookie",))
        return response
