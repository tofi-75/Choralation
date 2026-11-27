from datetime import timedelta

from django.utils import timezone

from accounts.models import AccountToken, RateBucket
from common.management import GuardedCommand


class Command(GuardedCommand):
    help = "Remove expired account links and rate buckets older than seven days."

    def handle(self, *args, **options):
        cutoff = timezone.now() - timedelta(days=7)
        AccountToken.objects.filter(expires_at__lt=cutoff).delete()
        RateBucket.objects.filter(started_at__lt=cutoff).delete()
        self.stdout.write("Expired security metadata cleaned; accounts retained.")
