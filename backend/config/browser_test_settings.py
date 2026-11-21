"""Local browser servers close DB connections at the end of each request."""

from django.core.exceptions import ImproperlyConfigured

from .settings import *  # noqa: F403
from .settings import DATABASES, DEBUG

if not DEBUG or DATABASES["default"]["HOST"] not in {"localhost", "127.0.0.1"}:
    raise ImproperlyConfigured("Browser test settings require a local development database.")

# Django runserver creates request threads; persistent connections can exhaust the
# shared portable PostgreSQL server when isolated profiles run concurrently.
DATABASES = {alias: {**database, "CONN_MAX_AGE": 0} for alias, database in DATABASES.items()}
