# Acceptance scenarios and fixture contract

**Status:** Test design and verified planning examples; no application tests have run.  
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
| A10 / M4 | Race save/finalize using separate PostgreSQL transactions; direct edit/delete of finalized; reopen as Planner | Consistent committed program/state, no partial update, finalized writes rejected, only Admin reopens |
| A11 / M5 | Rank fixture M_TARGET/Communion; filter by language/genre; remove season; clear eligible matches | Exact score map above; neutral eligibility; wrong-season/placement/inactive exclusion; no-season notice; empty results stay empty |
| A12 / M5 | Create equal candidates with identical title/date/count; exercise 1/7/8/14/15/30/31/60/61/90/91-day history; test future/same-day drafts/finalized | Deterministic final ID tie; exact weights; history cutoff; reasons match facts; no double recency boost |
| A13 / M5 | Finalize April 12 A; open April 19 suggestions with equally suitable older B; intentionally choose A, duplicate it, choose an unclassified active hymn | Older B outranks A; warnings show facts; overrides save; All Hymns remains usable after recommendations fail |
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
