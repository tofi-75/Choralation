# M3 UI and calendar review — October 8, 2026

**October 8 checkpoint update:** M3 engineering and all requested follow-ups are complete. The owner authorized the M3 commit and starting M4. Statements about uncommitted changes below describe their original verification runs. Human walkthrough/physical-phone acceptance remains pending and is now a required M4 gate; see [acceptance criteria](acceptance.md). The [latest review](m3-picker-view-review.md) records saved view, empty sections and Mass ordering.

**Status:** Implemented and verified; manual coordinator/physical-phone acceptance pending. Changes remain uncommitted.

## Delivered

- Space between the workspace notice and library/Mass buttons, with a wrapping action row.
- New Mass date defaults to the closest Sunday, including today, using the Beirut day. Monday–Wednesday select the previous Sunday; Thursday–Saturday select the next.
- Maronite date-based season suggestions, public Evangelizo integration, local fallback, and manual overrides. Existing saved plans retain their values on opening. See [calendar sources, rules and Settings follow-up](calendar.md).
- One compact program panel with placement dividers, smaller reading text, optional row editing, and 44 px icon touch targets. Input fonts remain 16 px to avoid mobile zoom.
- **+** adds hymns. Arrows on the left move a selection earlier/later within its placement, disabling at the first/last row.
- Pencil opens selection notes, **Change hymn**, and a separate link to shared library editing. Replacement preserves selection identity, order and notes. The bin removes only that Mass selection; it does not delete the library hymn.
- Warning actions inherit the notice background; the erroneous white block is removed.
- 36 fictional development hymns inserted through the documented repeatable command, attributed to the existing editor. Coverage verified for all 7 genres, 14 season choices, 11 placements, 4 languages and 9 tags. Some include named voices and all have numeric durations. No real lyrics/media/usage history are fabricated. Existing non-demo hymn IDs are retained.
- Calendar editing/selection is recorded as **M6.5 Calendar settings**; no Settings editor has been implemented yet.

## Verification

- Full gate: **123 backend tests and 29 frontend tests** passed; dependency consistency, Django checks, migration drift, Python/TypeScript lint/format, validated OpenAPI, typing and production build passed.
- A final query-validation addition was verified with all **25 calendar backend tests** and schema validation. Unknown/repeated parameters are rejected consistently with other API endpoints.
- **20 distinct M3 browser flows verified** across desktop and phone widths 360, 390 and 430 px. The first run passed 16 planner/permission/retry/conflict/replacement/refresh cases. The four new calendar cases passed on a targeted rerun after correcting test-only dropdown locators (exact label text and duplicate options in the separate list filter). These counts describe multiple runs, not one full 20-case green run.
- Calendar tests cover 2026 season boundaries, multiple Gregorian Easter years, API horizon/cache/bounded response validation, private access, missing/inactive category behavior, nearest-Sunday/year rollover, StrictMode startup, manual override races and endpoint failures.
- A real HTTPS Evangelizo adapter request returned a usable Holy Cross title; browser tests use local fallback to remain independent of the public service.
- Desktop/mobile workspace, planner and warning screenshots inspected; planner browser checks verify no horizontal overflow. Reduced typography does not reduce icon touch targets.
- Browser users, their owned Masses/hymns and uploaded artifacts were removed through scoped cleanup. Requested demo records remain for manual testing. Original specification unchanged; all writable tooling/artifacts remain inside the project.

## Manual testing

Refresh `http://127.0.0.1:5173/`, sign in with your existing account, and open **Mass plans → Create Mass**. Verify the Sunday/season suggestion, then change dates and override the season. Add hymns with **+**, reorder them with the left arrows, open the pencil to add notes/change the hymn, and remove selections with the bin. Wait for **Saved** before leaving. The library contains the 36 clearly marked fictional demo examples.

M4 finalization/history remains next; it was not implemented in this review. The calendar fallback is a broad season aid, not a complete local Ordo. Physical phones, Safari/Firefox, production deployment and Docker runtime remain unverified. The existing shared-entry bundle size warning remains scheduled for M7 performance work.
