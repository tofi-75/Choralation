# Maronite calendar suggestions

Requested October 8, 2026. The owner selected **Maronite** for now and requested calendar editing/selection in future Settings. This supersedes the original manual-only season rule for the planning UI. The Mass API still accepts explicit seasons; opening saved plans never recalculates them.

## Current behavior

New Mass forms default to the **nearest Sunday in either direction**, including today if Sunday. Monday–Wednesday use the preceding Sunday; Thursday–Saturday use the upcoming Sunday. The default uses the Asia/Beirut calendar day, including across midnight/year boundaries. Dates remain editable.

Creating a plan or changing its date requests `GET /api/v1/calendar/maronite/?date=YYYY-MM-DD`. Date and suggested season are applied together. Users can override/clear the season; late responses cannot replace newer choices. Opening an existing plan preserves its saved date/season.

The endpoint requires sign-in and accepts dates from 1900 through 2199. A missing or inactive suggested category returns a null ID and prompts manual selection. See [App season groups](#app-season-groups) for the eight default choices.

## Public API

[Evangelizo Reader v2](https://feed.evangelizo.org/v2/reader.php) documents `lang=MAA` for Arabic/Maronite and `type=liturgic_t` for the day's title. Live requests on October 8 returned Holy Cross for October 11 and church consecration for November 1.

```text
https://feed.evangelizo.org/v2/reader.php?date=20261011&type=liturgic_t&lang=MAA
```

No key is required. Only the date is sent; no user, hymn or Mass information leaves the app. The feed supplies text titles rather than structured season IDs and documents a 30-day horizon. Our backend only contacts it within 30 days of the team's current day, with a three-second timeout and no retries. It accepts bounded UTF-8 plain text (4096 bytes/500 characters), rejecting HTML/error responses. Titles are cached a day and failures five minutes in Django's process-local cache. `MARONITE_FEED_ENABLED=false` keeps local suggestions without upstream access; browser tests use this setting and provider unit tests mock the network.

Explicit Arabic season wording maps to a known season. Ambiguous titles (e.g. saints) display the API title but use date boundaries for the broad season. `source=evangelizo` therefore means a usable title was obtained, not that the provider returned a structured season ID. Failure/out-of-horizon dates use `source=local` and no day title. External availability is never required to save a plan.

## Local fallback

Rules come from the [Maronite Inter-Eparchial Music Commission's norms](https://www.maronitemusic.org/2-uncategorised), the [Maronite Eparchy of Australia's 2026 calendar](https://maronite.org.au/wp-content/uploads/2026/01/Maronite-2026-Calendar.pdf), and a [Catholic education Maronite-year overview](https://resource-macs.com/wp-content/uploads/2022/02/MaroniteChurch.pdf). Tests verify 2026 boundaries and Gregorian Easter in multiple years.

| Season | Inclusive start | End before |
| --- | --- | --- |
| Advent & Christmas | First Sunday of November | January 6 |
| Epiphany | January 6 | Cana Sunday (Easter minus 49 days) |
| Lent | Cana Sunday (Easter minus 49 days) | Palm Sunday (Easter minus 7 days) |
| Passion | Palm Sunday (Easter minus 7 days) | Resurrection Sunday |
| Resurrection | Gregorian Easter Sunday | Pentecost (Easter plus 49 days) |
| Pentecost | Pentecost Sunday | September 14 |
| Holy Cross | September 14 | First Sunday of November |

Advent & Christmas includes Consecration, Renewal, the Announcements, and the Christmas Eve and Nativity liturgies. Epiphany includes the three pre-Lenten Commemorations. Ordinary Time is a manual choice because the Maronite date rules cover the year. Choir-specific date overrides accommodate eparchial exceptions, local feast transfers, and evening and vigil boundaries.

## Choir calendar settings — M6

Open **Choirs → your choir → Choir calendar**. Members can read; choir Planners and Admins can edit. Choose **Maronite** for automatic suggestions or **Manual season selection** for no automatic season. Choose an IANA timezone; Asia/Beirut is the default for existing and new choirs. Default dates, archive boundaries, usage-date labels and the provider horizon follow that choir's day. Changing settings never rewrites a saved Mass date or season.

An exact-date override wins over both modes. Choose an active season for a date in 1900–2199; one override per choir/date can be replaced or removed. Removing it restores the selected mode. A deactivated season remains labelled in existing overrides and Masses but is not suggested for new selections. Calendar overrides also prevent deletion of their referenced season. No broad date-range editor or additional liturgical traditions are included in M6.

**Preview a date** queries saved settings and displays the season and source. `override` and `manual` use no external service. Maronite mode keeps the documented Evangelizo/local fallback behavior and never blocks saving a deliberate manual season. A preview is fetched when requested; it is not a background provider-health monitor or a complete diocesan Ordo.

Calendar settings use a shared version for defaults and overrides. If another planner saves first, reload saved settings and reapply your change. Unsaved edits are guarded on navigation/reload/sign-out. Settings and dependent queries refresh after successful saves, and choir switches retain isolated cache keys.

## App season groups

The approved default order is **Advent & Christmas**, **Epiphany**, **Lent**, **Passion**, **Resurrection**, **Pentecost**, **Holy Cross**, and **Ordinary Time**. Ordinary Time continues to mark hymns suitable for any season.

The season migration combines the old Birth of Our Lord, Advent, and Christmas categories into Advent & Christmas. It folds Commemorations into Epiphany, Great Lent into Lent, Holy Week and Passion Week into Passion, and Easter into Resurrection. It moves existing hymn links, saved Mass season assignments, and choir date overrides to the resulting categories. Retired categories are inactive. Coordinator-created categories outside those groups keep their settings. Restoring the old individual assignments requires a backup from before the migration.

## Maronite calendar references

The Maronite Eparchy of Australia groups the year into six major seasons by including the commemorations with Epiphany and Passion Week with Great Lent. The *Qurbono* lists the Passion separately. Beirut's liturgical resources present both the commemorations and Passion Week as distinct sections. The table follows the Australian eparchy's six broad groups. [Australian eparchy overview](https://maronite.org.au/product/the-maronite-liturgical-year-website-resource/) · [Qurbono](https://www.stmaron.org/qurbono) · [Maronite Archdiocese of Beirut](https://maronitearchdiocesebeirut.org/الروزنامة/)

| Main season | Sundays and principal celebrations |
| --- | --- |
| Glorious Birth | Consecration and Renewal of the Church at the start of the liturgical year. Then come the Announcement to Zechariah, Annunciation to Mary, Visitation to Elizabeth, Birth of John the Baptist, Revelation to Joseph, and Genealogy of Jesus. The Christmas portion includes the Nativity, Praises of Mary, the Circumcision on January 1, and Finding in the Temple before Epiphany. |
| Epiphany and Commemorations | The Lord's baptism on January 6 and the Sundays after Epiphany. The final three Sundays before Lent commemorate the priests, the righteous and just, and the faithful departed. |
| Great Lent and Passion Week | Cana Sunday opens Lent, followed by the Sundays of the Leper, the Hemorrhaging Woman, the Prodigal Son, the Paralytic, and the Blind Man. Lazarus Saturday precedes Hosanna (Palm) Sunday. Passion Week includes the Thursday of the Mysteries, Good Friday, and Saturday of the Light. |
| Resurrection | Easter Sunday, New Sunday, the other Sundays of Resurrection, and the Ascension on Thursday and its following Sunday. The season runs up to Pentecost. |
| Pentecost | Pentecost Sunday, Trinity Sunday the following week, and the Sundays and weekday services up to the Exaltation of the Holy Cross. |
| Holy Cross | Exaltation of the Holy Cross on September 14 and the Sundays after it, up to the opening of the next liturgical year. |

See the [Maronite Inter-Eparchial Music Commission's norms](https://maronitemusic.org/liturgical-year?id=20) for service rules and the [Beirut 2026–27 calendar](https://maronitearchdiocesebeirut.org/wp-content/uploads/2026/10/Calendrier-Liturgique-Version-2026-2027.pdf) for the dated observances and readings in Arabic.

In Beirut's 2026 calendar, the Consecration is November 1, the Renewal is November 8, and the Announcement to Zechariah is November 15. December 24 has its own Christmas Eve observance, and the feast of the Nativity is December 25. A Nativity vigil can be celebrated on the evening of December 24. [Beirut 2026–27 calendar](https://maronitearchdiocesebeirut.org/wp-content/uploads/2026/10/Calendrier-Liturgique-Version-2026-2027.pdf) · [Australian eparchy decree on feast days and vigils](https://maronite.org.au/wp-content/uploads/2025/09/Maronite-Days-of-Obligation-Feast-Days_Revised.pdf)
