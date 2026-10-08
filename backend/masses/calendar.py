"""Maronite season suggestions, with an optional bounded Evangelizo day-title feed.

Only the selected date is sent upstream (never an account or program). The feed
documents a 30-day horizon and returns titles, not structured season IDs. Local
season boundaries therefore remain available for any supported planning date.
See docs/calendar.md for provenance, limitations, and the future Settings work.
"""

import re
from datetime import date, timedelta
from html import unescape
from urllib.error import URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.cache import cache
from django.utils import timezone

MARONITE_SEASONS = {
    "birth-of-our-lord": "Birth of Our Lord",
    "epiphany": "Epiphany",
    "commemorations": "Commemorations",
    "great-lent": "Great Lent",
    "passion-week": "Passion Week",
    "resurrection": "Resurrection",
    "pentecost": "Pentecost",
    "holy-cross": "Holy Cross",
}
FEED_URL = "https://feed.evangelizo.org/v2/reader.php"


def easter_sunday(year: int) -> date:
    """Gregorian Easter (Meeus/Jones/Butcher computus), used in this Maronite cycle."""
    a = year % 19
    b, c = divmod(year, 100)
    d, e = divmod(b, 4)
    f = (b + 8) // 25
    g = (b - f + 1) // 3
    h = (19 * a + b - d - g + 15) % 30
    i, k = divmod(c, 4)
    weekday_correction = (32 + 2 * e + 2 * i - h - k) % 7
    m = (a + 11 * h + 22 * weekday_correction) // 451
    month, day = divmod(h + weekday_correction - 7 * m + 114, 31)
    return date(year, month, day + 1)


def local_season(day: date) -> str:
    """Broad seasons, not a full Ordo/feast-precedence engine or evening calendar."""
    easter = easter_sunday(day.year)
    november = date(day.year, 11, 1)
    consecration = november + timedelta(days=(6 - november.weekday()) % 7)
    if day < date(day.year, 1, 6) or day >= consecration:
        return "birth-of-our-lord"
    if day < easter - timedelta(days=70):
        return "epiphany"
    if day < easter - timedelta(days=49):
        return "commemorations"
    if day < easter - timedelta(days=7):
        return "great-lent"
    if day < easter:
        return "passion-week"
    if day < easter + timedelta(days=49):
        return "resurrection"
    if day < date(day.year, 9, 14):
        return "pentecost"
    return "holy-cross"


def feed_title(day: date) -> str | None:
    """Cache safe plain text; reject HTML/manual/error pages even on HTTP 200."""
    if not settings.MARONITE_FEED_ENABLED or abs((day - timezone.localdate()).days) > 30:
        return None
    key = f"maronite-title-v1:{day.isoformat()}"
    cached = cache.get(key)
    if cached is not None:
        return cached or None
    try:
        uri = (
            FEED_URL
            + "?"
            + urlencode({"date": day.strftime("%Y%m%d"), "type": "liturgic_t", "lang": "MAA"})
        )
        request = Request(uri, headers={"User-Agent": "Choralation-calendar/1.0"})
        with urlopen(request, timeout=3) as response:
            raw = response.read(4097)
        title = unescape(raw.decode("utf-8-sig")).strip()
        if len(raw) > 4096 or not title or len(title) > 500 or "<" in title:
            raise ValueError("Not a plain day title")
        if any(marker in title.casefold() for marker in ("error", "wrong param", "not available")):
            raise ValueError("Feed returned an error")
    except (URLError, TimeoutError, OSError, UnicodeError, ValueError):
        cache.set(key, "", 300)
        return None
    cache.set(key, title, 86400)
    return title


def title_season(title: str) -> str | None:
    """Recognize explicit season wording only; saints/ambiguous titles use date rules."""
    normalized = re.sub(r"[\u064b-\u065f\u0670\u0640]", "", title)
    for slug, words in (
        (
            "passion-week",
            (
                "أسبوع الآلام",
                "اسبوع الالام",
                "خميس الأسرار",
                "الجمعة العظيمة",
                "سبت النور",
                "الشعانين",
            ),
        ),
        ("holy-cross", ("بعد عيد الصليب", "زمن الصليب", "عيد ارتفاع الصليب")),
        ("pentecost", ("العنصرة",)),
        ("resurrection", ("القيامة", "الأحد الجديد")),
        ("great-lent", ("الصوم", "عرس قانا")),
        ("commemorations", ("الكهنة", "الأبرار والصديقين", "الموتى المؤمنين")),
        ("epiphany", ("الدنح",)),
        (
            "birth-of-our-lord",
            (
                "الميلاد",
                "تقديس البيعة",
                "تجديد البيعة",
                "بشارة زكريا",
                "بشارة العذراء",
                "زيارة العذراء",
                "مولد يوحنا",
                "البيان ليوسف",
                "أحد النسبة",
            ),
        ),
    ):
        if any(word in normalized for word in words):
            return slug
    return None
