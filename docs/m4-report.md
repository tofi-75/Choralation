# M4 — finalization and trustworthy history

> **October 13, 2026 priority update:** Render + Supabase hosting preparation is the current delivery task; see [deployment guide](hosting.md). All account/login/provider setup and publishing are manual owner steps deferred until later. Physical-phone acceptance moves from M4 to M5. Saved-Mass performance redesign and recommendations are deferred. Historical milestone statements below retain their original dates; hosted completion requires actual URL, persistence and pipeline verification.


**Date:** October 8, 2026. **Engineering status:** M4.1–M4.5 implemented and verified. M4 remains open for required M4.6 human/phone acceptance. M3 was committed as `daefc9b` — Complete M3 draft planning and review improvements. M4 changes remain uncommitted; the owner's authorization covered the M3 checkpoint only. Required physical-phone/coordinator acceptance is pending.

## Implemented scope

- Planner/Admin finalization uses a one-click action and inline read-only/usage notice on the saved page. Admin-only reopen retains impact confirmation. Empty sections/programs remain allowed; program suitability notes remain on the page.
- Shared row lock, expected revision and audit fields; effective transitions advance once, repeats at the current revision preserve timestamp/revision, stale repeats conflict. Finalized metadata/program/deletion services reject writes and internal admin remains read-only.
- Global finalized occurrence counts and maximum Mass dates through isolated subqueries. Repeats count separately; drafts/reopened plans contribute nothing. No mutable usage counters or synthetic history.
- Library usage labels, exact/relative/scheduled dates, four usage sorting choices, inclusive occurrence date filters, not-used-since and never-used choices.
- Newest-first Mass history with status/date/season/title/notes filters and compact previews; hymn detail lists each finalized occurrence, placement/order/notes and links to saved programs.
- Lifecycle cache refresh across Mass/list/history/hymn/usage/library variants. Stale confirmation requires refreshed review. Background finalization preserves an existing editor's working copy rather than redirecting away from local notes.
- No new dependency or database migration. Existing Mass/selection IDs, status, dates and user records are preserved unless the user explicitly performs a lifecycle action. Test cleanup reopens/deletes only the exact run's temporary owned Masses through guarded services.

## Verification record

- Focused lifecycle/usage/library/PostgreSQL race suite: 64 tests passed.
- Full backend regression: **163 tests passed**. Frontend: **46 tests passed**. Dependency/Django/migration/schema and Python checks passed. TypeScript, frontend lint/format and production build passed; final lifecycle cache-refresh refinements were rechecked with its three focused tests and frontend checks. The full check command initially stopped at formatting for the newly edited browser test; formatting was corrected and the remaining checks/build were rerun successfully. No single final full-gate rerun is claimed.
- Browser journeys cover hymn creation, repeated selections, Save draft, finalization failure/retry, read-only state, usage/history, Admin reopen and re-finalization, cached never-used filters, stale confirmation and retained unsaved notes in another tab.
- **Six distinct browser journeys verified across combined runs:** complete weekly workflow at desktop/360/390/430 px, plus stale-review/retained-editor-copy at desktop/390 px. The later three-case weekly run passed desktop/360/430; the preceding run passed the two stale-review cases and 390 px weekly case, with a desktop navigation locator failure corrected before the targeted rerun. These are combined results, not a claimed single six-case green run. Earlier failed attempts were test locator/ready-state issues (checkbox, nested usage text, populated notes, menu readiness), now corrected.
- Desktop and phone history/program screenshots were inspected; history titles were made smaller and scheduled wording clarified. Test cleanup removed only run-owned accounts/records, including finalizations. The manual app backend was restarted and readiness returned HTTP 200. Documentation links/source hash and whitespace checks passed. No M4 files were staged or committed.

## Required physical-phone acceptance — A10P

This is a required M4 gate, requested by the owner. Automated phone widths do not complete it. A coordinator must run the actual application on real devices, recording evidence below. An unavailable device/browser remains pending rather than being assumed covered.

The [physical-phone session guide](phone-testing.md) was prepared October 9, 2026, with LAN launch instructions and a results checklist. After reported slow initial loading, the launcher was changed to build/serve optimized assets. A controlled mobile simulation improved cold sign-in from 11.30 to 2.05 seconds and initial resources from 9.10 to 0.56 MB; see the guide for conditions and limitations. Preparing or simulating the session does not complete physical-device acceptance.

1. Create a Mass, verify/override date and season, open the picker, search and scroll it.
2. Add multiple hymns, reorder by touch, and enter selection/Mass notes with the keyboard open.
3. Save draft, reopen the saved view, use Edit, finalize and verify read-only state and usage/history.
4. As Admin, reopen and confirm usage disappears; re-finalize and confirm it returns once.
5. Repeat in narrow portrait and landscape. Confirm dialogs and navigation scroll, actions remain reachable, text wraps and no horizontal overflow occurs.
6. Interrupt the connection during saving, retry, and verify the latest notes/order survive reload. Review a two-session conflict without losing the local copy.

| Surface | Device / OS / browser | Date / reviewer | Result / defects |
| --- | --- | --- | --- |
| Real iPhone / Safari | Pending | Pending | Not tested |
| Real Android / Chrome | Pending | Pending | Not tested |
| Desktop keyboard regression | Automated coverage plus manual review pending | Pending | Record focus, confirmation, reorder and filter access |
| Firefox regression | Pending | Pending | Not tested |
| Coordinator weekly workflow | Pending | Pending | Human acceptance not yet recorded |

M4 cannot be marked fully accepted until required human/phone results are recorded and blocking defects are resolved. Docker/Linux, production/recovery and shared-entry bundle performance remain the documented later operational/M7 work. Recommendations remain M5; category/calendar Settings remain M6.

## Run and review

The local app is ready at `http://127.0.0.1:5173`. Refresh, open a saved Mass, review **Finalize Mass**, then inspect **Mass history** and the hymn's **Usage history**. Use an Admin account to verify **Reopen draft**. No existing user Mass was finalized by development/testing.

Verification commands from a project terminal:

```powershell
.\dev.cmd check
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& .\scripts\e2e.ps1 -TestArguments @('lifecycle.spec.ts')"
.\.local\node\node.exe .\scripts\verify-m0.mjs
```

Generated artifacts stay in `.cache` and `frontend/test-results`. Existing M3 saved programs need no migration for M4; the backend must be restarted to load new routes. Keep M4 uncommitted unless the owner explicitly requests its checkpoint.

## October 10 planning review

### October 10 browser review

The Mass list now states when the last result has been reached and shows a return-to-top action once Create Mass starts scrolling above the viewport. Search explicitly describes finding saved titles/notes and belongs to the list, rather than the creation form.

Creation is a separate two-step flow: `/masses/new` confirms date, Maronite season, title and notes; Next creates the draft and opens hymn/order selection. Before creation, a fresh inclusive same-date lookup checks all saved plans regardless of list filters/status. Existing plans require explicit confirmation; cancellation or lookup failure preserves inputs and creates nothing. Multiple services on one date remain permitted. This is a client confirmation at the time of checking, not a transactional uniqueness constraint against concurrent creation.

The hymn step shows confirmed details read-only. Back to Mass details and Next switch the same mounted working copy, preserving hymn order, notes and the revision-guarded autosave queue. Each placement's + toggles a compact inline picker with search and a Filters button, scrollable results and metadata (language, placement, season suitability, genres/tags, key, duration, voices and sheet-music availability). Placement filtering and season/neutral preference remain server-side before pagination; mismatch/duplicate overrides and focus restoration remain explicit.

New selection identity uses a browser-session counter rather than the secure-context-only `crypto.randomUUID`. These keys identify unsaved rows locally and never serve as security tokens or database IDs. Both random and manual additions now work on an HTTP LAN origin.

**Deferred owner request — saved program for use during Mass:** recorded October 10; redesign has not started. Revisit the saved view to make it practical for accessing hymns and performing during the service: compact ordered navigation, quick access to lyrics/sheet-music PDFs/voice parts/audio where available, visible performance notes and straightforward movement between hymns. Agree the detailed layout later with the owner, then validate a complete rehearsal on a real phone with materials reachable during Mass. Keep this separate from the implemented planning review and from the still-pending physical-phone M4 gate.

Verification for this review:

- **50 frontend tests passed**, including duplicate-date cancel/confirm/lookup-failure and distinct row identities with no browser crypto API. TypeScript, ESLint, Prettier, production build and Git whitespace checks passed. The existing shared-entry bundle size warning remains later performance work.
- **24 distinct browser cases verified across combined runs at the live HTTP LAN origin:** eleven planning/lifecycle cases each at desktop and 390 px, plus the new review journey at 360/430 px. The first 22-case run passed 21; the mobile reopen test assumed its older Mass was on page one after fixture accumulation. It now searches by title before reopening. Its two-case targeted rerun passed, and both narrow review cases passed. This is combined verification, not a claim that the original 22-case run was entirely green.
- Verified duplicate-date cancellation/confirmation, read-only detail summary and back/next preservation, random/manual additions without `randomUUID`, inline metadata/filters/search/scrolling/pagination, mismatch and duplicate acknowledgement, ordering/notes, failed-save retry, conflicts/navigation guards, saved view and finalize/reopen/usage/history. Responsive assertions and screenshots cover narrow widths; physical-device acceptance remains pending.
- Test-created accounts and records were removed through the existing run-owned cleanup; existing user plans were preserved. Artifacts are in `.cache/browser-review-results`, `.cache/browser-review-followup` and `.cache/browser-review-narrow`. Code and documentation edits remain inside the project and uncommitted.

## October 10 picker refinement

The owner's eight picker/planner comments are implemented: aligned and compact controls, sortable desktop metadata with mobile cards, sidebar collapse, Any-season warning precedence and accessible mouse/touch/keyboard drag reordering. Engineering checks passed 198 backend and 58 frontend tests plus schema/migration/type/lint/format/build checks. Browser verification, data cleanup and remaining physical-device limits are recorded in the [picker review report](picker-review.md). These changes remain uncommitted; M4 physical-phone acceptance and saved-program performance redesign remain pending.

## Compact Mass list follow-up

Ready programs and pending drafts now have separate URL-backed lists, with ready programs as the default, compact search/Filters controls and an arrow-only return-to-top button. Engineering checks passed 198 backend and 61 frontend tests; 28 distinct browser cases passed across corrected runs. See [Mass list review](mass-list-review.md). M4 physical-phone acceptance remains pending, and these changes are uncommitted.

## Details and finalization follow-up

See [planning refinement](planning-refinement.md): equal date/season controls, stacked title/notes, narrower desktop table without nested vertical scrolling, plain drag grips and inline one-click finalization. Revision guards and Admin-only reopening remain enforced. Physical-device acceptance is still pending.

The latest refinement passed 198 backend tests, 62 frontend tests and 28 browser cases in its full isolated sequence. Checks cover layout, grip interaction/persistence, direct finalization failures/conflicts and accurate usage/history. See [recorded evidence](planning-refinement.md).


## October 11 final row controls and regression run

Drag grips now appear only for sections with multiple hymns; Edit/Remove are smaller (40 px), side by side at every width, and singleton rows use the space vacated by the grip. Saved status is burgundy. The fresh full check passed **198 backend and 62 frontend tests** plus schema/migration/type/lint/format/build gates. **44 browser cases passed without failures** across the completed isolated sequence, covering every spec at desktop/390 px plus focused picker/creation/list cases at 360/430 px. See [the refinement report](planning-refinement.md) for exact run artifacts and coverage.

Disposable browser databases/accounts were cleaned up; manual app services remain running. Changes are uncommitted. Real-device acceptance and the deferred saved-program performance redesign remain pending; Cloudflare remains removed and firewall/clock settings are unchanged.
