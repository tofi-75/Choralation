# Section picker and saved Mass view — October 8, 2026

**October 8 checkpoint update:** M3 engineering and all requested follow-ups are complete. The owner authorized the M3 commit and starting M4. Statements about uncommitted changes below describe their original verification runs. Human walkthrough/physical-phone acceptance remains pending and is now a required M4 gate; see [acceptance criteria](acceptance.md). The [latest review](m3-picker-view-review.md) records saved view, empty sections and Mass ordering.

## Delivered behavior

- Adding/replacing a hymn defaults to the selected section's active hymns. With a selected Mass season, matching and season-neutral hymns appear before other-season choices. Title/newest sorting operates within both groups. Other-season choices still require acknowledgement. Search, language/genre filters and pagination remain available. **Search all placements** is an explicit advanced override, preserving manual mismatch acknowledgement; reopening the picker resets that override and search state.
- The fixed picker now has a viewport-bounded scroll area, touch panning and contained overscroll. The background remains locked by Radix while results, filters and footer controls can be reached inside the dialog.
- **Save draft** waits for pending/coalesced metadata and program writes, including an autosave already in flight. Success opens a fresh saved read-only view. Failure/conflict leaves local edits in the editor with its existing retry/review controls. The button waits for calendar/random selection work to finish and editor controls are disabled while completing the save.
- `/masses/:id` is the compact saved view. All active placement sections appear in configured order, showing **Hymn not selected** when empty, including when the whole program is empty. Selected inactive sections remain visible; unselected inactive sections stay hidden. Hymn order/notes, Mass notes and collapsed advisory program notes remain readable. No edit controls or form fields appear. **Edit** opens `/masses/:id/edit` for Planner/Admin drafts. List links open the view; creation starts in the editor. Viewers and finalized programs cannot open an editor.

Save draft preserves draft status. It does not implement finalization or create usage/history; those remain M4. No database migration, additional saved flag, dependency or external service is needed. Existing saved Mass URLs now open the view, and users can explicitly select Edit. No commit is authorized.

## Implementation notes

`preferred_season` is an optional ordering preference on the existing hymn list API. It uses a season subquery and a Boolean annotation before stable ordering/pagination. Literal season filtering is unchanged. The picker query key includes section, season, override, filters, ordering and page; context changes reset the picker rather than reusing an unrelated page or warning.

`DraftSaver.flush()` returns a shared promise for the entire active drain. This lets the explicit save wait for every coalesced write rather than returning early when autosave is already running. Navigation happens after React receives the Saved state, avoiding a false unsaved-navigation dialog. The saved view waits for a fresh mount-time read of the same authenticated detail endpoint. It performs no writes and keeps the existing server-side permission/revision protections.

## Verification

New PostgreSQL tests check preference ordering before pagination for title/newest, neutral matches, section exclusion, no duplicate rows, literal-filter/search compatibility, and invalid/repeated preference IDs. A saver regression checks that explicit save shares the in-flight promise and awaits newer queued edits. Saved-view component tests check notes/order, deliberate Edit navigation, absence of editor fields, Viewer restrictions and finalized read-only behavior.

The new browser journey checks a multi-page section picker, season/neutral ordering, real wheel scrolling and viewport bounds, program-save failure recovery, waiting for a held autosave, compact saved view, reload, edit reentry and list-to-view navigation. Existing Mass workflows were rerun across desktop and 360/390/430 px widths to check picker focus, explicit mismatch override, replacement, conflict review, navigation guards, random picks, roles and calendar behavior.

- **145 backend tests** passed, alongside dependency/Django/migration checks, Python lint/format and validated OpenAPI.
- **39 frontend tests** passed, including the new shared-save and saved-view tests. Frontend lint/format/type checks and production build passed; frontend checks were repeated after the final mobile label/checkbox/plural fixes.
- **28 distinct Mass browser flows verified** across 1280/360/390/430 px. The broad run passed 27 flows; its 390 px saved-view case exposed an existing mobile rule hiding all page-heading eyebrows. A scoped saved-view override fixed the label, and that complete browser journey passed on the targeted rerun. These results cover multiple runs, not a claimed single 28-case green run.
- Desktop and phone saved-view screenshots were inspected. The picker test exercises actual wheel scrolling, pagination and viewport bounds. Physical-phone touch/Safari/Firefox review remains pending.
- Scoped browser cleanup removed temporary users and their owned hymns/Masses. The manual app backend was restarted and readiness returned HTTP 200. Documentation links, source-specification hash and whitespace checks passed. No changes were staged or committed; tooling and artifacts stayed inside the project.

The existing shared-entry bundle warning remains tracked for M7. M4 finalization/history and complete Settings remain unimplemented.

## Empty sections follow-up

The saved view now reads the configured placements as well as selected rows, so empty active sections remain visible with **Hymn not selected** in display order. Selected inactive sections are retained, and inactive empty sections are hidden. Empty sections use compact spacing and create no placeholder selection records. Five focused saved-view component tests, TypeScript/lint/format checks, and the updated 390 px save/view/edit browser journey passed. The phone screenshot was inspected and temporary browser records were removed through scoped cleanup. No commit was made.

## Mass list ordering follow-up

Today and upcoming Masses appear first, nearest date first, followed by past Masses under **Archived**, most recent first. Both groups use descending ID for same-day ties. The server evaluates the team-local date once per request (`APP_TIME_ZONE`, default Beirut), annotates `is_archived`, and orders before pagination. The browser uses that annotation, so its timezone cannot disagree with the server. Existing search/date/season filters apply normally. Archive is a presentation grouping with no migration or writes: past drafts keep their status/revision and still open with Edit available to planners.

Verification: all 20 Mass API tests passed, including new coverage for Beirut midnight, same-day ties, ordering across two pages, date-filtered archives and unchanged draft status/revision. All 41 frontend tests, type/lint/format checks, production build and OpenAPI validation passed. The new desktop and 390 px phone browser journeys passed, checking ordering, both groups, no horizontal overflow and access to an archived draft's saved view/Edit link. Temporary browser records were cleaned up, and the manual backend was restarted successfully. No changes were staged or committed.
