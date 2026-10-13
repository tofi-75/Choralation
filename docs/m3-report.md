# M3 delivery report — persistent draft planning

**October 8 checkpoint update:** M3 engineering and all requested follow-ups are complete and committed as `daefc9b`. The owner authorized the M3 commit and starting M4. Statements about uncommitted changes below describe their original verification runs. Human walkthrough/physical-phone acceptance remains pending and is now a required M4 gate; see [acceptance criteria](acceptance.md). The [latest review](m3-picker-view-review.md) records saved view, empty sections and Mass ordering.

**Date:** October 7–8, 2026. **Engineering status:** Complete, including the requested October 8 reviews. The owner authorized the M3 checkpoint commit and starting M4. Coordinator walkthrough and physical-phone acceptance remain pending as required M4 gate items. M2 was committed as `aada303`.

## Delivered increment

- Mass/selection migrations with protected hymn, placement, and season references; draft status, attribution, and one monotonic Mass revision.
- Authenticated paginated Mass lists with date/season/search filters; metadata creation/PATCH, Admin draft deletion, and atomic full-program PUT.
- Manual season/date/title/notes; multi-hymn placement sections, ordering, notes, removal, completion counts, and visible retained inactive rows.
- Active-hymn picker with search/pagination, language/genre filters, and title/newest sorting; explicit duplicate/suitability warning acknowledgement.
- Compact phone-friendly actions; optional title/notes and date/season filters expand on demand. Picker warnings replace the results with a focused confirmation; saved warnings identify the affected hymn and context. Completion counts include only active placements while retaining inactive sections.
- Serialized, coalesced autosave with visible Unsaved/Saving/Saved/Unable-to-save states; no response overwrites later edits. Retry preserves completed metadata acknowledgements and new-row identities.
- Two-tab conflict review with the local program retained and explicit discard/reload; browser/internal navigation and sign-out warnings; read-only Viewer workflows and confirmed Admin deletion.
- Read-only Mass/selection Django admin; on-demand screen loading; API/architecture/README updates; per-run browser artifact cleanup removes owned Masses before referenced hymns.

Each metadata/program endpoint is atomic independently. The shared revision serializes both; finalization and usage calculations remain M4, recommendations M5. The original source specification is unchanged.

## Verification

Use `.\dev.cmd check` and `.\dev.cmd e2e` with PostgreSQL running.

- 98 backend tests passed, including 19 new draft/permission/atomicity cases and a real two-connection PostgreSQL revision race.
- 26 frontend tests passed, including ten saver regressions for slow acknowledgements, coalescing, new-row identity, partial failure, conflicts, canonical metadata, unmount disposal, and live reference refresh without replacing local edits.
- Django checks, migration drift, dependency consistency, validated OpenAPI, Python/TypeScript lint, formatting, typing, and production build passed.
- The complete real-browser suite passed 18 tests across desktop (1280 × 900) and mobile (390 × 844), covering authentication, library, and draft planning. Six M3 cases include draft reentry, creation failure/retry, optional details, saved date filters, picker sorting, autosave failure/conflict, navigation guards, and role boundaries.
- Desktop/mobile planner, warning, and Mass-list screenshots were inspected; browser checks also verified no horizontal overflow, search/confirmation focus, and warning actions visible within the viewport.
- An actual HTTP backend stop/start check preserved date, title, manual season, revision, selection IDs/order/notes, and the authenticated session. Its temporary actor and owned records were removed afterward.

## Review fixes — October 7

The full read-only review identified three frontend defects, now corrected:

- Canonical metadata acknowledgements update unchanged local fields, including generated titles, without overwriting edits made while the request was pending. The canonical metadata becomes the next save baseline.
- Unmounting during metadata PATCH stops the queued program PUT; already-started requests may settle.
- Successful Mass refreshes reconcile hymn/placement references independently of local metadata, order, selection identities, and notes. Older reference timestamps cannot replace newer ones. Advisory warnings follow the current local program and refreshed references, including while edits await saving.

Five added saver regressions passed. All eight M3 browser cases passed again on desktop and mobile, including generated-title display and a background refetch of a renamed/deactivated hymn while local selection notes were pending; those notes survived save and reload. Frontend typing, lint, formatting, and production build also passed after these fixes.

## Limits and remaining work

Coordinator acceptance, physical-phone/Safari/Firefox review, Docker/Linux execution, production deployment/recovery, and M7 performance fixtures remain unverified. A production build warns about the shared entry bundle exceeding 500 kB before gzip; on-demand page chunks reduce startup work, with further performance measurement scheduled for M7. No deployment occurred. Offline durable storage and cross-tab merging are deferred.

The next milestone after M3's gate is M4 finalization and trustworthy history. Parish/choir account membership and collaborative choir Mass lists remain deferred until all other planned work is complete.

## Final M3 checkpoint — October 8

Delivered follow-ups: compact touch controls and planner, public/local Maronite calendar suggestions, 36 fictional demo hymns, season/placement random picking, section-scoped season-preferred scrolling picker, explicit Save draft and compact saved view/Edit, creation Next label, empty sections showing Hymn not selected, and upcoming-nearest/Archived-past ordering. See [UI/calendar review](m3-ui-review.md), [random picker](random-picker.md), and [latest picker/view/list review](m3-picker-view-review.md).

The final full `dev.cmd check` passed with **147 backend tests and 41 frontend tests**, dependency/Django/migration/schema checks, Python and frontend lint/format, type checks and production build. Focused Mass-list browser journeys passed on desktop and 390 px phones after the latest list change; earlier review documents preserve the broader browser evidence. Physical-device testing has not been performed. The existing bundle-size warning remains M7 work.

M4 starts with revision-guarded finalize/reopen and actual finalized-only usage/history. The required M4 physical-phone acceptance journey is specified in [acceptance](acceptance.md); emulation does not close it. This M3 checkpoint is the only newly authorized commit; subsequent M4 changes stay uncommitted unless requested.
