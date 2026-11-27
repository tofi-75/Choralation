"""Guard the entire mutation, including post-commit Storage deletions.

Production uses a separate *session* connection for the advisory lock. The business
connection may still use a transaction pooler. A disconnected guard fails closed.
Maintenance is persistent: a dead CI runner must never reopen writes mid-migration.
"""

from contextlib import contextmanager

import psycopg
from django.conf import settings
from django.db import connection

from config.hosting import database_options

MUTATION_LOCK = 7281349201
OPERATIONS_LOCK = 7281349202


class ReadOnlyError(Exception):
    pass


@contextmanager
def mutation_guard():
    """Shared lock remains held until the caller and its commit callbacks return."""
    if not settings.PRODUCTION_OPERATIONS_ENABLED:
        yield
        return
    url = settings.OPERATIONS_DATABASE_URL
    # Only local/test development may reuse Django's session connection.
    guard = (
        psycopg.connect(url, autocommit=True, **database_options(url, settings.DEBUG))
        if url
        else None
    )
    try:
        with (guard or connection).cursor() as cursor:
            cursor.execute("SELECT pg_try_advisory_lock_shared(%s)", [MUTATION_LOCK])
            if not cursor.fetchone()[0]:
                raise ReadOnlyError()
            try:
                cursor.execute(
                    "SELECT read_only, database_id FROM common_operationsstate WHERE id = 1"
                )
                state = cursor.fetchone()
                if state is None or state[0]:
                    raise ReadOnlyError()
                if guard:
                    with connection.cursor() as business:
                        business.execute(
                            "SELECT database_id FROM common_operationsstate WHERE id=1"
                        )
                        actual = business.fetchone()
                    if not actual or actual[0] != state[1]:
                        raise ReadOnlyError()
                yield
            finally:
                cursor.execute("SELECT pg_advisory_unlock_shared(%s)", [MUTATION_LOCK])
    finally:
        if guard:
            guard.close()
