"""Create/remove only this browser run's randomized, development-local accounts.

Passwords arrive through the process environment and never print. Reject remote
databases and existing names; cleanup targets the exact usernames owned by this
run. This does not reset users, truncate tables, or seed production/demo data.
"""

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings")

import django  # noqa: E402

django.setup()

from django.conf import settings  # noqa: E402
from django.contrib.auth import get_user_model  # noqa: E402
from django.contrib.auth.models import Group  # noqa: E402
from django.db import transaction  # noqa: E402

suffix = os.environ.get("E2E_USER_SUFFIX", "")
if not re.fullmatch(r"[a-f0-9]{12}", suffix):
    raise ValueError("Provide this run's randomized E2E_USER_SUFFIX.")
if not settings.DEBUG or settings.DATABASES["default"]["HOST"] not in {"localhost", "127.0.0.1"}:
    raise ValueError("Browser fixtures are restricted to a local development database.")
roles = ("Admin", "Planner", "Viewer")
names = [f"e2e-{suffix}-{role.lower()}" for role in roles]
user_model = get_user_model()
with transaction.atomic():
    if sys.argv[1] == "create":
        password = os.environ.get("E2E_PASSWORD", "")
        if len(password) < 20 or user_model.objects.filter(username__in=names).exists():
            raise ValueError("Refusing empty fixture passwords or overwrite of existing accounts.")
        for role, name in zip(roles, names, strict=True):
            user = user_model.objects.create_user(username=name, password=password)
            user.groups.add(Group.objects.get(name=role))
        print("This browser run's development accounts are ready.")
    elif sys.argv[1] == "cleanup":
        user_model.objects.filter(username__in=names).delete()
        print("This browser run's accounts removed; other records preserved.")
    else:
        raise ValueError("Expected create or cleanup.")
