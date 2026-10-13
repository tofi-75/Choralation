"""Serve built React assets and named page routes from the same HTTPS origin."""

import re

from django.conf import settings
from django.http import HttpResponse, HttpResponseNotFound
from django.views.decorators.http import require_safe
from whitenoise.middleware import WhiteNoiseMiddleware


class FrontendStaticMiddleware(WhiteNoiseMiddleware):
    """WhiteNoise serves assets only; HTML always requires revalidation."""

    def __init__(self, get_response):
        super().__init__(get_response)
        assets = settings.FRONTEND_ROOT / "assets"
        if assets.is_dir():
            self.add_files(assets, prefix="/assets/")

    def immutable_file_test(self, path, url):
        # Vite hashes filenames differently from Django manifest hashes.
        return bool(
            re.search(r"/assets/.+-[A-Za-z0-9_-]{8,}\.[^/]+$", url)
        ) or super().immutable_file_test(path, url)


@require_safe
def frontend_page(request):
    """Only approved application routes receive the public React shell."""
    index = settings.FRONTEND_ROOT / "index.html"
    if not index.is_file():
        return HttpResponseNotFound("Frontend build unavailable.")
    response = HttpResponse(index.read_bytes(), content_type="text/html; charset=utf-8")
    response["Cache-Control"] = "no-cache"
    return response
