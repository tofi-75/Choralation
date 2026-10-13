# October 10 Mass list review

## Delivered behavior

- A compact 44 px search bar and adjacent Filters icon replace the large filter box. Search covers titles/notes in the selected list; its accessible label and helper remain available to screen readers. Filters expands date bounds and season controls.
- **Ready Masses** is the default and requests `status=finalized`. **Pending drafts** requests `status=draft`, including autosaved and explicitly saved drafts until finalization. Existing lifecycle data is unchanged: Save draft does not mean finalized.
- Status filtering happens on the server before counting, date ordering and pagination. Both lists retain closest-upcoming-first order and past Masses in the Archived group at the end. URL parameters preserve selected list, search, dates, season and pagination on reload/deep links. Switching lists keeps search/date/season and resets page; Clear filters keeps the selected lifecycle list.
- The return-to-top action shows only an arrow, with the accessible name **Scroll to top** and a 44 px target. Its existing appearance trigger and focus restoration remain.

## Verification

- `scripts/check.ps1` passed: **198 backend tests, 61 frontend tests**, dependency/Django/migration/schema/Python checks, TypeScript, ESLint, Prettier and production build. The existing 531 kB shared-entry warning remains later performance work.
- The new real-browser list journey passed at **899 px desktop and 360/390/430 px**. It verifies lifecycle membership, archived ordering, aligned 44 px controls, hidden/expanded filters, reload persistence, retained lifecycle on Clear filters, server pagination with 26 records per state and page reset on switching, list end cues, no page overflow and arrow-only return-to-top/focus. Desktop and 360 px screenshots were inspected. Artifacts: `.cache/review2-isolated-results-8482b4f9a577`.
- Initial browser checks caught inherited 48 px input sizing; a scoped 44 px minimum fixed alignment. The test setup also originally used an unsupported one-record page size; it now uses the API's valid 25-record pages with sufficient fixtures. The final four-profile run passed.
- **28 distinct browser cases passed across the final runs:** four new list profiles; twenty existing desktop/390 px planning/lifecycle cases; the list-order test at desktop/390 px after updating its old mixed-list assumption to explicitly choose Pending drafts; and the creation/picker journey at 360/430 px. The 22-case regression invocation initially had two outdated list-order assertions; both passed in the targeted correction run. Artifacts: `.cache/review2-isolated-results-ffec7ebd2ab0` (twenty passes and initial failures), `.cache/review2-isolated-results-f68e482518ba` (two corrected passes), `.cache/review2-isolated-results-9ea94cc47bcd` (two narrow-width passes).
- Frontend lint and formatting passed again after the test updates. The documentation verifier passed 185 local links across 25 Markdown documents, the original requirement-file SHA is unchanged, and Git whitespace checks passed. All temporary test databases/accounts were cleaned up; the normal manual frontend/backend still respond successfully.
- Browser fixtures run in a disposable project-local database, isolated from manual Masses/hymns. Physical phone acceptance remains pending. No migration is required and no files are staged or committed.
