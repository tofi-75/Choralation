"""Load the project's simple KEY=value environment file without changing the host.

Process-provided values win. No shell expansion, execution, or global/profile
configuration occurs. Quoted single-line values are supported; multiline values
and interpolation are intentionally unsupported and rejected when malformed.
"""

import os
import re
from pathlib import Path

from django.core.exceptions import ImproperlyConfigured


def load_environment(file: Path) -> None:
    """Read an optional project-owned .env, preserving existing process settings."""
    if not file.exists():
        return
    for number, raw in enumerate(file.read_text(encoding="utf-8-sig").splitlines(), 1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        name, separator, value = line.partition("=")
        name, value = name.strip(), value.strip()
        if not separator or not re.fullmatch(r"[A-Z][A-Z0-9_]*", name):
            raise ImproperlyConfigured(f"Invalid environment entry on line {number}.")
        if value.startswith(("'", '"')):
            if len(value) < 2 or value[-1] != value[0]:
                raise ImproperlyConfigured(f"Unclosed environment value on line {number}.")
            value = value[1:-1]
        os.environ.setdefault(name, value)


def boolean(name: str, default: bool = False) -> bool:
    """Parse explicit booleans so a string 'false' never enables production debug."""
    value = os.environ.get(name, str(default)).lower()
    if value not in {"true", "false", "1", "0"}:
        raise ImproperlyConfigured(f"{name} must be true or false.")
    return value in {"true", "1"}


def csv(name: str, default: str = "") -> list[str]:
    """Read a comma-separated configuration value and discard empty entries."""
    return [value.strip() for value in os.environ.get(name, default).split(",") if value.strip()]
