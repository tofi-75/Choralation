"""Create the local development database idempotently, using .env's connection.

Only localhost is accepted. SQL identifiers are quoted with psycopg; no user
input is interpolated. Tests use a separate database created by pytest-django.
"""

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

import psycopg  # noqa: E402
from psycopg import sql  # noqa: E402
from psycopg.conninfo import conninfo_to_dict  # noqa: E402

from config.environment import load_environment  # noqa: E402

load_environment(ROOT / ".env")
config = conninfo_to_dict(os.environ["DATABASE_URL"])
if config.get("host") not in {"127.0.0.1", "localhost"}:
    raise ValueError("This helper creates only a local development database.")
database_name = config.pop("dbname")
config["dbname"] = "postgres"
with psycopg.connect(**config, autocommit=True) as connection:
    if not connection.execute(
        "SELECT 1 FROM pg_database WHERE datname = %s", [database_name]
    ).fetchone():
        connection.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(database_name)))
print("Local development database is ready.")
