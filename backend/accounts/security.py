"""PostgreSQL rate limits survive process restarts. Keys never retain identifiers."""

import hashlib
from datetime import timedelta

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import Throttled

from accounts.models import RateBucket


def limit(scope, identifier, maximum=5, seconds=900):
    key = hashlib.sha256(f"{scope}:{str(identifier).strip().lower()}".encode()).hexdigest()
    now = timezone.now()
    blocked = False
    with transaction.atomic():
        RateBucket.objects.get_or_create(key=key, defaults={"started_at": now})
        bucket = RateBucket.objects.select_for_update().get(key=key)
        if bucket.started_at <= now - timedelta(seconds=seconds):
            bucket.started_at, bucket.attempts = now, 0
        blocked = bucket.attempts >= maximum
        if not blocked:
            bucket.attempts += 1
            bucket.save()
    if blocked:
        raise Throttled(wait=seconds, detail="Too many attempts. Please try again later.")
