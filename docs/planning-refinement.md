# October 10 details, table and finalization refinement

## Delivered behavior

- Date and liturgical-season fields use the same 44 px height in creation and the edit details step. Optional Title and Notes each occupy a full row.
- Desktop hymn suggestions use explicit compact column widths (728 px minimum, previously 950 px) and denser rows. The table grows with the current result page instead of introducing a nested vertical scrollbar. Horizontal scrolling retains the frozen title/Add cells and sortable columns. Long titles show up to two lines; overflowing metadata keeps full text in the DOM and native hover text. Phone cards retain their bounded scroll region and complete metadata.
- Reordering presents a plain grip icon with no border/background. The native control retains keyboard instructions, focus, touch pointer capture and a 44 px target; persistence/cancellation behavior is unchanged.
- Finalize Mass now submits once directly beside a small inline notice that the saved program becomes read-only and selections enter usage counts. It no longer opens a modal or repeats the hymn list. Requests use the displayed saved revision, disable repeated submissions and refresh affected caches. A revision conflict refreshes the program and requires explicit acknowledgement before a new attempt. Admin reopening retains a compact impact confirmation.

## Verification

- `scripts/check.ps1` passed: **198 backend tests, 62 frontend tests**, dependency/Django/migration/schema/Python checks, TypeScript, ESLint, Prettier and production build. The existing shared-entry build-size warning remains later performance work.
- The picker/drag journey passed at desktop and 360/390/430 px, including compact column widths, no desktop inner vertical scrollbar, sort/frozen-column reachability, mouse/touch/keyboard cancellation and persisted order/IDs/notes. A desktop picker screenshot was inspected. Artifacts: `.cache/review2-isolated-results-3c2b4c3506e2`.
- **28 browser cases passed in the completed isolated sequence:** four picker/drag profiles; 22 existing details/planning/lifecycle cases at desktop and 390 px; and two creation/picker cases at 360/430 px. Creation checks verify equal field heights and title/notes stacking. Lifecycle checks verify one-click finalization without a dialog, temporary failure/retry, inline stale-revision review, read-only state, counts/history, Admin reopen and retained local edits. Artifacts: `.cache/review2-isolated-results-9fac3e73ce2f` and `.cache/review2-isolated-results-40fe9506a2cf`.
- Documentation-link/source-fixture verification and Git whitespace checks passed. Temporary test databases/accounts were cleaned up; manual services remain running. No user Masses/hymns were altered by the tests.

Browser fixtures use a disposable local database, separate from manual Masses/hymns. Physical-device acceptance and the saved-program performance redesign remain pending. Cloudflare remains removed. Changes are uncommitted.

## October 11 row controls

- Drag grips appear only when the same placement contains at least two hymns. A single hymn leaves no empty grip column; read-only rows retain their compact presentation.
- Edit and Remove are 40 px controls, arranged side by side at every viewport width. The summary uses the remaining space and long titles wrap without page overflow.
- The Saved badge uses burgundy with light text; pending-save styling remains distinct.
- The existing browser journeys now check grip visibility as a section gains hymns, compact action dimensions/alignment, and singleton replacement with retained notes. Existing mouse/touch/keyboard cancellation and persistence checks are retained.

### Final October 11 verification

- **198 backend tests and 62 frontend tests passed** in a fresh `scripts/check.ps1` run. Dependency, Django, migration, schema, Python lint/format, TypeScript, ESLint, Prettier and production-build gates passed.
- **44 browser cases passed with no failures in the completed isolated sequence:** four picker/drag profiles; 22 desktop/390 px planning and lifecycle cases; two 360/430 px creation cases; 14 desktop/390 px authentication, hymn-library and Mass-list cases; and two 360/430 px Mass-list cases. All seven browser spec files were exercised at desktop and 390 px; focused picker, creation and list journeys also ran at 360/430 px. These are Chromium simulations, not physical Safari/device acceptance.
- Results, in sequence: `.cache/review2-isolated-results-b63ee9838349`, `.cache/review2-isolated-results-49702a6ff6a7`, `.cache/review2-isolated-results-c8a5cbcb87bb`, `.cache/review2-isolated-results-d2d799c396f2` and `.cache/review2-isolated-results-b3b56509de30`. The 360 px program screenshot was inspected; action pairs remain horizontal and the Saved badge is burgundy.
- Both disposable browser databases and their run-owned accounts were removed. The manual login page and backend readiness returned HTTP 200. Documentation/source-fixture and Git whitespace checks passed. No user data, firewall, clock or Cloudflare settings were changed; no files were staged or committed.
