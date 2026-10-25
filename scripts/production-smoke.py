"""Check the actual production image: routes, assets, HTTPS proxy and API isolation.

CI uses a local disposable database and an explicit proxy header. Never point this
HTTP diagnostic at an untrusted proxy; user-facing verification uses HTTPS.
"""

import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


def get(origin, path, secure=True):
    headers = {"X-Forwarded-Proto": "https"} if secure else {}
    try:
        return urlopen(Request(origin + path, headers=headers), timeout=10)
    except HTTPError as response:
        return response


def main(origin):
    for _ in range(90):
        try:
            with get(origin, "/health/ready/") as response:
                if response.status == 200:
                    break
        except (URLError, TimeoutError):
            pass
        time.sleep(2)
    else:
        raise RuntimeError("Production readiness did not succeed.")
    for path in (
        "/login",
        "/register",
        "/verify-email",
        "/forgot-password",
        "/reset-password",
        "/account",
        "/choirs",
        "/choirs/join",
        "/choirs/new",
        "/choirs/1",
        "/dashboard",
        "/history",
        "/hymns/1",
        "/hymns/mine",
        "/masses/164/edit",
    ):
        with get(origin, path) as response:
            assert response.status == 200, path
            html = response.read().decode()
            assert 'id="root"' in html, path
            assert response.headers["Cache-Control"] == "no-cache"
    assets = re.findall(r'(?:src|href)="(/assets/[^" ]+)"', html)
    assert assets, "No built React assets found."
    for asset in assets:
        with get(origin, asset) as response:
            assert response.status == 200, asset
            assert "text/html" not in response.headers.get("Content-Type", "")
    with get(origin, "/static/admin/css/base.css") as response:
        assert response.status == 200
    for path in ("/about", "/privacy", "/terms"):
        with get(origin, path) as response:
            public_html = response.read().decode()
            assert response.status == 200 and "Toufic Lattouf" in public_html
            assert "<script" not in public_html and 'id="root"' not in public_html
            assert "default-src 'none'" in response.headers["Content-Security-Policy"]
        stylesheet = re.search(r'href="(/static/public[^\"]*\.css)"', public_html)
        assert stylesheet
        with get(origin, stylesheet[1]) as response:
            assert response.status == 200 and "text/css" in response.headers["Content-Type"]
    with get(origin, "/api/v1/hymns/") as response:
        assert response.status == 403
        assert "application/json" in response.headers["Content-Type"]
    for path in (
        "/api/missing/",
        "/health/missing/",
        "/assets/missing.js",
        "/static/missing.css",
        "/media/private.pdf",
    ):
        with get(origin, path) as response:
            assert response.status == 404, path
            assert b'id="root"' not in response.read(), path
    with get(origin, "/admin/missing/") as response:
        # Django admin may redirect anonymous users to its own login page.
        assert b'id="root"' not in response.read()
    print("Production routes, assets, authentication boundary and readiness passed.")


if __name__ == "__main__":
    main(sys.argv[1])
