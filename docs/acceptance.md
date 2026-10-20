# Acceptance scenarios and fixture contract

> **October 13, 2026 priority update:** Render + Supabase hosting preparation is the current delivery task; see [deployment guide](hosting.md). All account/login/provider setup and publishing are manual owner steps deferred until later. Physical-phone acceptance moves from M4 to M5. Saved-Mass performance redesign and recommendations are deferred. Historical milestone statements below retain their original dates; hosted completion requires actual URL, persistence and pipeline verification.

**Status:** Static M0 fixtures remain design examples. M1–M4 engineering tests and browser workflows have run; see their delivery reports and [latest M3 evidence](m3-picker-view-review.md). M4 lifecycle/usage/history engineering is verified in the [M4 report](m4-report.md); coordinator acceptance remains pending and actual-phone A10P moves to M5. M5–M7 scenarios below remain acceptance contracts until implemented and verified. Physical-phone acceptance is now required for M5 and remains pending.
Run `node .\scripts\verify-m0.mjs` from the project root to validate the static M0 package without installing dependencies or writing files.

## Fixture rules

[m0-scenarios.json](fixtures/m0-scenarios.json) contains only fictional metadata, symbolic keys, and planned expectations. It is not production seed data or a Django `loaddata` file. Later test factories must translate keys to actual database IDs, preserving relationships without assuming seeded IDs. Individual test scenarios use isolated copies; tests must never depend on another test's mutations.

Reference date is April 19, 2026, with team timezone Asia/Beirut. The deliberately manual Easter season on the January fixture is a ranking-test classification, not a statement about the liturgical calendar. M0 does not calculate a calendar.

The fixture covers eight hymns, seven Masses, repeated selections, multi-category joins, duplicate titles, Arabic/Syriac, inactive retained references, reopened draft history, same-day history, and future finalized history. Category data is a small test subset, not the complete eleven-placement production seed.

### Exact example expectations

| Fixture | Global library usage | Usage before target | Easter Communion score |
| --- | --- | --- | --- |
| H_RECENT | 3 occurrences; May 3 scheduled last date | 1 occurrence; April 12, 7 days | 50 + 30 - 60 = **20** |
| H_OLD | 2 occurrences; January 4 | 2 occurrences; January 4, 105 days | 50 + 30 + 15 = **95** |
| H_NEUTRAL | Never used (current Mass is draft) | Never used before target | 50 + 15 + 20 - 100 = **-15** because already selected |
| H_DOUBLE | Never used | Never used before target | 50 + 30 + 20 = **100** |
| H_ARABIC | Never used | Never used before target | 50 + 30 + 20 = **100** |
| H_LENT | Never used | Never used before target | Ineligible season |
| H_INACTIVE | 1 historical occurrence, March 1 | History remains readable | Ineligible active state |
| H_SYRIAC | Never used | Never used before target | Ineligible placement/season |

H_RECENT and H_DOUBLE deliberately share a title; they remain distinct records. H_OLD's two positions in one Mass count twice despite multiple categories/tags. Reopened M_REOPENED contributes nothing. M_SAME_DAY/M_FUTURE affect global usage but not target-date ranking.

Literal Easter + Communion + Traditional + Arabic finds H_RECENT and H_DOUBLE, excluding neutral-only H_NEUTRAL. Communion + (Arabic OR French) returns the five active fixture records specified in JSON. Search `mary` + Closing finds H_DOUBLE through its tag, not H_RECENT, which lacks Closing. `not_used_since=2026-04-01` excludes H_RECENT and includes never-used/older-use active records.

## Runnable acceptance scripts by milestone

“Runnable” here means an explicit action/assertion recipe for the milestone's real app. Until that milestone exists, the recipe is a design contract, not a passing test. Implementation converts high-value cases into pytest/React/Playwright suites without coupling to component internals.

| ID / milestone | Setup and actions | Assertions/evidence |
| --- | --- | --- |
| A01 / M1 | Fresh DB; provision Admin, Planner, Viewer, ungrouped user; bootstrap CSRF; attempt invalid/login/refresh/logout and direct writes | Valid login persists, logout clears; missing CSRF fails; role precedence and ungrouped Viewer are enforced; no anonymous data |
| A02 / M2 | Seed categories twice; rename/deactivate a seed then seed again; create a required-field example and edit optional metadata | No duplicate/reset; input persists; category slugs stable; no fake usage fields |
| A03 / M2 | Enter isolated fixture hymns; apply literal Easter/Communion/Traditional/Arabic and Arabic/French combination; search tag/alternate title/first line | Exact expected membership; no joined duplicates; pagination stable; copy/refresh/back preserves URL filters |
| A04 / M2 | Submit missing title/season/placement, bad URL/duration; inspect Arabic/Syriac; simulate failed form save; attempt Admin-only writes as Planner/Viewer | Correct field errors, preserved form, correct direction/text storage, backend permission failures |
| A05 / M3 | Create a non-Sunday Mass; choose season manually; add two Communion hymns, reorder, notes, remove one, refresh/restart | Dates allowed, manual season retained, committed rows/order/notes survive; optional placement count correct |
| A06 / M3 | Save a payload with one invalid row; then retain historical inactive row by ID; attempt new inactive row | Invalid full payload leaves all original rows intact; retained row works; new inactive link fails |
| A07 / M3 | Rapid edits under slow network; one failed save; two tabs save the same expected revision | No stale response overwrites last edit; retry keeps data; second writer receives precondition conflict; no false Saved state |
| A08 / M4 | Isolated one-selection draft; finalize, repeat current-revision finalize, reopen, re-finalize | Count 0→1→1→0→1; timestamp/revision follow contract; no duplicate selections; old-revision replay is conflict |
| A09 / M4 | Load the complete fixture; inspect H_OLD/H_RECENT, history date predicates, and M_INACTIVE_HISTORY | Counts 2 and 3, expected max dates; inactive section visible; scheduled wording; joins do not multiply usage |
| A10 / M4 | Race save/finalize using separate PostgreSQL transactions; direct edit/delete of finalized; reopen as Planner | Consistent committed program/state, no partial update, direct finalized metadata/program writes rejected; confirmed Planner/Admin Edit reopens; only Admin deletes finalized Masses |
| A10P / M5 | Coordinator on a real phone: create, scroll picker, touch reorder, notes with keyboard open, save/reopen/Edit, finalize/history, connection interruption/retry; portrait/landscape | Record device, OS/browser, date and outcomes; actions reachable, no horizontal overflow or data loss. iOS Safari and Android Chrome where available; unavailable coverage pending. Emulation alone does not pass. Desktop keyboard/Firefox regression also recorded. |
| A11 / Deferred | Rank fixture M_TARGET/Communion; filter by language/genre; remove season; clear eligible matches | Exact score map above; neutral eligibility; wrong-season/placement/inactive exclusion; no-season notice; empty results stay empty |
| A12 / Deferred | Create equal candidates with identical title/date/count; exercise 1/7/8/14/15/30/31/60/61/90/91-day history; test future/same-day drafts/finalized | Deterministic final ID tie; exact weights; history cutoff; reasons match facts; no double recency boost |
| A13 / Deferred | Finalize April 12 A; open April 19 suggestions with equally suitable older B; intentionally choose A, duplicate it, choose an unclassified active hymn | Older B outranks A; warnings show facts; overrides save; All Hymns remains usable after recommendations fail |
| A14 / M6 | For each category type add/edit/rename/reorder/deactivate/reactivate; use Planner direct request | Every operation works for Admin and respects unique names/slugs; non-Admin write rejected |
| A15 / M6 | Reference a category from a draft and finalized program; rename/deactivate/delete; rerun seeds | Referential IDs/rows remain; new choices exclude inactive; delete rejected; seed rerun preserves edited rows |
| A16 / M7 | No upcoming Mass, today's Mass, no season, future finalized; then print a saved multi-hymn program | Dashboard sensible empty/context states; local date ordering; print matches order, labels drafts, no clipping |
| A17 / M7 | Real coordinator prepares five-placement program by desktop/mobile/keyboard; review dialogs/errors/direction/print | Record actual time and feedback; proposed ≤5-minute target; focus/error/accessibility checks pass |
| A18 / M7 | Clean installation and tests/build/deploy checks; performance fixture; backup to restore in separate disposable DB | Accurate README, measured p95/queries, production protections, recovered record/count totals, no fabricated deployment claim |

## Negative-path fixtures created per test

Do not put invalid objects into the base fixture: generate invalid payloads within isolated tests. Include negative/noncontiguous positions, duplicate row IDs, foreign selection IDs, nonexistent/inactive relationship IDs, missing/old revision headers, forbidden server-owned fields, duplicate category names after trim/case changes, invalid dates/ranges, and unauthorized active-state changes.

When comparing result sets, assert membership separately from specified ordering. Ranking order uses deterministic title/ID rules; do not invent a cross-language sort order from a particular browser locale. Test same-title candidates using explicit persisted IDs.

## Evidence handling

Record commands/results with milestone/ticket IDs. Store any generated traces, screenshots, test databases, and logs in project-local locations. M0's verifier exercises planning facts only; it cannot prove CSRF protection, persistence, permissions, transaction behavior, performance, or actual UI usability. Those gates require the real application.

## October 10 planning review acceptance

- Create Mass opens a separate details page with no list-search controls. Existing same-date plans (draft or finalized) trigger confirmation before creation. Cancel or failed lookup creates no record and keeps the input; confirmation permits another Mass on the date.
- Next opens hymns/order with confirmed date/season read-only. Back to details and Next preserve the same working copy, selection notes/order and queued saves. Save draft waits for writes and opens the saved view.
- Placement + expands/collapses its inline picker, rather than a modal. Search and Filters sit beside each other; rows show available metadata. Section eligibility and season/neutral priority apply before pagination. Search/filter/sort, scrolling, mismatch/duplicate overrides, Escape/Close and restored focus work by keyboard and touch.
- Random and manual additions work over HTTP without `crypto.randomUUID`, producing distinct local row identities. Failures keep selections/notes unchanged.
- The final list page explicitly states the list has ended. Search explains titles/notes; date and season filters remain separate. Scroll to top appears as Create Mass moves above the viewport and returns it into view.
- Check desktop and narrow 360/390/430 px widths for overflow and accessible actions. Actual-device A10P acceptance remains a separate pending gate.
- Deferred: redesign the saved view for performance during Mass, then test access to hymns and their available performance materials in a real rehearsal. Do not mark this deferred work complete from planning-screen tests.

## A10R — October 10 picker and order review

1. In a Mass hymn step, open +. Search and Filters have the same top edge and height; keyboard focus remains visible without a gold outline. Open Filters: language, genre and sorting share one row at 360/390/430 px.
2. At desktop widths, sort each metadata column in both directions. Verify server-wide ordering across pages and season matches/any-season choices first. On a phone, confirm compact cards and use the equivalent sort selector; table width must not make the page overflow.
3. Click the sidebar music mark, navigate using collapsed links, and expand it again. Mobile Menu stays usable.
4. Add an Any-season hymn with retained other-season links: no season confirmation or program notice. Add an explicitly different-season hymn: its actual season is visible and explicit acknowledgement remains necessary. Duplicate/placement/inactive notices still apply independently.
5. Add several hymns with notes in one placement. Drag the handle with mouse and touch; reload and verify order, saved selection IDs and notes. Use Space/Enter, arrows, Space/Enter to drop; Escape or an interrupted touch cancels. Other placements stay in order. Test edge scrolling on long sections during real-phone acceptance.

Automated Chromium touch input and phone-width screenshots are supporting checks. They do not complete required physical iPhone/Safari or Android/Chrome acceptance.

## A10L — Compact Mass list review

1. Open Mass plans: Ready Masses is selected and only finalized programs appear. Pending drafts shows saved drafts. Confirm closest upcoming first and past plans under Archived in both lists.
2. Search titles/notes, open the adjacent Filters icon, apply dates/season and reload. Selected list and filters persist. Switching lists preserves filters and resets pagination; Clear filters keeps the selected list.
3. Check aligned 44 px search/icon controls and no overflow at desktop and 360/390/430 px. Scroll past Create Mass: only the arrow is visible, its accessible name is Scroll to top, and activating it restores Create Mass into view.

Evidence is recorded in [Mass list review](mass-list-review.md); physical-device acceptance remains pending.

## A10F — Details, table and finalization refinement

1. On Create Mass and Back to Mass details, verify equal date/season heights and full-row Title then Notes.
2. Desktop suggestions have tighter columns and no nested vertical scrollbar; sort and horizontally scroll without losing title/Add actions. Long metadata remains available as full DOM/hover text. Phones retain cards and their bounded list.
3. Grip icons have no button border/background. Test mouse/touch drag, keyboard drop/cancel, saved IDs and notes.
4. Finalize a saved draft with one click: no modal appears; the inline notice explains read-only and usage counts. Retry a transient failure; reject a stale revision, review the refreshed program, acknowledge and try again. Verify history/counts and Admin-only reopening.

Evidence: [planning refinement](planning-refinement.md). Real-phone acceptance remains a separate pending gate.

## Hosting acceptance — October 13, 2026

| ID | Scenario | Gate |
| --- | --- | --- |
| H1 | Production routes/assets, proxy HTTPS, secure cookies/CSRF, no private-path fallback, storage errors and guarded startup/seeding | Automated local checks; Linux Docker remains CI verification |
| H2 | Real Render HTTPS URL with provisioned accounts, private Supabase DB/PDF storage and restart/redeploy persistence | Manual owner verification pending |
| H3 | Failed GitHub checks block deployment; subsequent passing main commit builds and deploys the hosted app | Manual owner pipeline verification pending |

H2/H3 are required to complete hosting; preparing Docker/YAML/docs alone is insufficient. Physical-phone A10P is moved to M5 and must be recorded on actual devices. Recommendations and saved-Mass performance redesign remain deferred.


## October 19, 2026 — Home and saved Mass review

- Login/root opens the Mass-focused home: next finalized Mass first, up to three more upcoming Masses, Drafts and All Masses links, four newest active hymns, All hymns/Add hymn (Planner/Admin), and Practice marked Coming soon. Empty/loading/retry states remain usable.
- Saved Masses show today/upcoming finalized programs in ascending team-local date order. Drafts have a separate URL-backed list. Archived Masses show only past finalized programs and expand all saved hymns on demand, with direct hymn links. Date filtering occurs before pagination.
- Creation dates fit their field and are capped at 13rem, with a calendar icon. Random selection is an accessible shuffle icon at the bottom; occupied placements and current edits stay intact.
- Ordinary Time links are suitable for any season: no mismatch warning in picker/program/saved view; season preference and random picks include them. Literal library filters remain unchanged.
- Saved drafts place Finalize and the Edit pen at top right. Desktop hover/focus explains finalization; narrow/touch screens use a short confirmation dialog. No permanent plain-text disclaimer.
- Finalized programs show an Edit pen for Planner/Admin and Delete for Admin only. Both require explicit confirmation. Confirmed Edit returns to draft and removes derived usage until re-finalized; deletion removes the Mass/selections and usage while retaining hymns. Stale revisions never force an action.
- Browser emulation is regression evidence only; physical-phone M5 acceptance remains pending. No live deployment is implied by these changes.

## October 20 performance materials and reading

- Verify vertically aligned New hymns controls, one-line Mass navigation at 320–844 px and no page overflow.
- Create an Arabic hymn with Latin Characters Name, lyrics, default key and tempo; save/refresh/edit without loss; find it using native and Latin letters. Required fields show burgundy stars with accessible semantics.
- Detail shows PDF, then available lyrics, then compact metadata; usage/scheduled date belong at the top of metadata. Edit is an accessible pen icon.
- In a saved program, titles are centered and prominent. Focus follows saved placement/selection order, preserves duplicates/notes, skips empty sections and shows PDF → lyrics → title priority. Test PDF failure, page changes, boundary controls, left/right swipe, keyboard, Escape and focus restoration.
- Verify screen-awake request, refusal, release on exit, late request resolution and visibility reacquisition. Browser support/system policy determine availability; confirm on actual phones under M5.
- Future Arabic language settings require complete English/Arabic translation, RTL, remembered preference, localized labels/errors/dates and unchanged hymn content. Feature remains deferred; see [UI improvement plan](ui-performance-review.md).
