# Maronite calendar suggestions

Requested October 8, 2026. The owner selected **Maronite** for now and requested calendar editing/selection in future Settings. This supersedes the original manual-only season rule for the planning UI. The Mass API still accepts explicit seasons; opening saved plans never recalculates them.

## Current behavior

New Mass forms default to the **nearest Sunday in either direction**, including today if Sunday. Monday–Wednesday use the preceding Sunday; Thursday–Saturday use the upcoming Sunday. The default uses the Asia/Beirut calendar day, including across midnight/year boundaries. Dates remain editable.

Creating a plan or changing its date requests `GET /api/v1/calendar/maronite/?date=YYYY-MM-DD`. Date and suggested season are applied together. Users can override/clear the season; late responses cannot replace newer choices. Opening an existing plan preserves its saved date/season.

The endpoint requires sign-in, accepts 1900–2199, and never creates/reactivates categories. A missing/inactive suggested category returns a null ID and prompts manual selection. The additive migration adds seven missing Maronite choices while preserving existing IDs, labels and hymn/Mass links; Pentecost is reused. Original Roman categories remain available for existing classifications and manual overrides.

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
| Birth of Our Lord | First Sunday of November | January 6 |
| Epiphany | January 6 | Easter minus 70 days |
| Commemorations | Easter minus 70 days | Cana Sunday (Easter minus 49 days) |
| Great Lent | Cana Sunday | Palm Sunday (Easter minus 7 days) |
| Passion Week | Palm Sunday | Resurrection Sunday |
| Resurrection | Gregorian Easter Sunday | Pentecost (Easter plus 49 days) |
| Pentecost | Pentecost Sunday | September 14 |
| Holy Cross | September 14 | First Sunday of November |

Birth includes consecration/renewal and announcements, following the Commission's grouping. This planning fallback is not a full Ordo: eparchial exceptions, feast precedence, readings, evening/vigil boundaries and local transfer rules require manual overrides. Settings will later accommodate local practice.

## Future Settings

**M6.5 Calendar settings:** select the tradition/calendar and team timezone; edit season ranges/local observance overrides with date preview; expose source/refresh status; preserve saved plans. Define permissions and range precedence before implementation. The Settings editor is recorded, not implemented in this increment.
