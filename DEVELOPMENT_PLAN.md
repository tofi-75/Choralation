# Mass Hymn Picker — Development and Delivery Plan

> **October 25, 2026 — Simple accounts:** Registration opens Home immediately; email ownership remains unverified. Verification and emailed recovery are independently disabled. Owner-assisted recovery is available at tofi.lattouf@gmail.com. This supersedes earlier activation instructions. See [release, configuration and recovery](docs/simple-accounts-release.md). Hosted backup, exact-commit CI and deployment acceptance are release gates.

> **October 20, 2026 — Accounts and choirs:** Self-service email verification, recovery, choir membership and choir-specific hymn counts supersede the shared-workspace rules below. See [account and choir setup](docs/accounts-and-choirs.md). Existing local data is preserved in Initial choir. Registration and mandatory legacy verification ship disabled pending owner email setup. Hosting checks: core flows accepted, records persist; PDF persistence and CI-gated deployment remain pending.


> **October 13, 2026 priority update:** Render + Supabase hosting preparation is the current delivery task; see [deployment guide](docs/hosting.md). All account/login/provider setup and publishing are manual owner steps deferred until later. Physical-phone acceptance moves from M4 to M5. Saved-Mass performance redesign and recommendations are deferred. Historical milestone statements below retain their original dates; hosted completion requires actual URL, persistence and pipeline verification.

**Prepared:** October 5, 2026  
**Source:** [mass_hymn_picker_codex_spec.md](mass_hymn_picker_codex_spec.md)  
**Status:** M0–M3 engineering work is complete, including the October 8 M3 review changes. The owner authorized the M3 checkpoint and starting M4 on October 8. M4 lifecycle/usage/history engineering is implemented and verified, uncommitted; coordinator acceptance remains pending, while physical-phone acceptance moves to M5. Hosting preparation is implemented; live provider setup and acceptance remain owner tasks. Later features remain deferred. See [M0 report](docs/m0-report.md), [M1 report](docs/m1-report.md), [M2 report](docs/m2-report.md), and [M3 report](docs/m3-report.md). Coordinator acceptance remains pending.
**Current repository:** Documented Django/PostgreSQL and React application with session authentication, role policy, a persistent hymn library, five classifications, seeds, responsive forms/detail/filter screens, and a persistent multi-placement draft planner with recoverable autosave and revision conflicts. Project-local setup and automated checks cover the delivered workflows. Container configuration is supplied but has not been executed on this machine.

## 1. Delivery objective

Deliver a dependable internal tool that lets a church music coordinator build a hymn library, prepare a Mass program, review previous programs, and choose appropriate hymns with explainable recommendations.

**Primary usage is on phones.** Design and verify each delivered workflow for phone use first, with compact search/tag controls, readable content, and easy touch interaction. Preserve a usable desktop layout alongside it.

The development sequence must produce working software gradually. Each milestone includes database persistence, backend permissions and validation, a React interface, relevant tests, and a demonstrable user workflow. Avoid completing the whole backend before delivering any usable frontend.

The source specification remains authoritative for product scope and required fields. This plan makes its execution more precise. Decisions marked **planning default** resolve ambiguities for implementation; record them in `docs/architecture.md` before coding the affected feature. Changes to explicit source requirements require a documented scope decision.

### Success measures

| Measure | Proposed acceptance target | How to verify |
| --- | --- | --- |
| Weekly planning speed | A coordinator with a populated library can prepare and finalize a typical five-placement program in five minutes | Observe a pilot session; exclude initial library entry |
| Save reliability | Confirmed saves survive refresh and restart; failed saves remain visible and retryable | Automated persistence checks and forced network failures |
| History correctness | Drafts never affect historical usage; repeated finalization never duplicates usage | Integration tests against PostgreSQL |
| Selection control | Recent-use and classification warnings can be overridden; inactive records cannot be newly selected | Picker acceptance scenarios |
| Small-team usability | Core library and planner workflows work by keyboard and on a narrow mobile viewport | Component tests and hands-on review |
| Expected scale | Comfortable at 5,000 hymns and tens of thousands of selections | Defined performance fixture and measured release checks |

Targets above are planning goals, not measured results. Record actual measurements during the pilot.

## 2. Scope and release boundaries

### Required for version 1

- Session authentication, backend-enforced Admin/Planner/Viewer permissions, and secure production configuration.
- All five editable classification dimensions, with many-to-many relationships for genres, seasons, placements, and tags; one primary language per hymn.
- Complete hymn metadata from the specification, search, combined filters, sorting, pagination, and safe deactivation/deletion.
- Persistent draft Mass programs, multiple hymns per placement, ordering, selection notes, autosave, finalization, and explicit Admin reopening.
- Derived finalized usage, Mass history, hymn usage history, deterministic recommendations, explanations, and overridable warnings.
- A useful dashboard, responsive layouts, accessible controls, deliberate loading/empty/error states, and a simple print view.
- Migrations, seed commands, Docker development support, OpenAPI documentation, automated checks, and an accurate README.

### Explicitly deferred

CSV/Excel import, optional CSV export, automatic calendar calculation, multilingual variants, reusable setlists, attachments, musician assignments, tenancy, advanced analytics, notifications, integrations, and AI recommendations are outside the initial delivery. They must not replace unfinished required work. Optional CSV export may be considered after the version 1 gate; it has no milestone dependency.

**Later improvement — parish/choir accounts and collaboration (requested October 6, 2026):** Accounts will belong to a parish and a choir, and the people responsible for that choir will be able to edit its Mass list collaboratively. Schedule this only after all other planned work is complete, including M0–M7 and the version 1 release gate. Track the follow-up in [the deferred backlog](docs/backlog.md#deferred-until-all-other-planned-work-is-complete); it does not change the initial shared-workspace permissions or current milestone scope.

No user-management React screen or full audit-log framework is required. Initially provision users and assign groups through protected Django admin or documented management commands.

### Release levels

| Release | Available after | What the team can use |
| --- | --- | --- |
| Development preview | M1 | Sign in to a running application |
| Library pilot | M2 | Build, classify, find, and maintain real hymns |
| Planning pilot | M3 | Prepare and reliably save real draft programs |
| Weekly workflow MVP | M4 | Finalize programs and review accurate usage/history |
| Assisted planning beta | M5 | Choose hymns with explainable recency-aware suggestions |
| Version 1 candidate | M6 | Manage categories without developer intervention |
| Production version 1 | M7 | Complete, verified product with deployment and recovery instructions |

Earlier pilots are useful subsets, not claims that version 1 is complete. Settings are initially seeded; recommendations appear only when working. Do not expose empty navigation destinations or present synthetic usage as real history.

## 3. Decisions to settle before implementation

### 3.1 Architecture and environment

- Use the specified Django/DRF/PostgreSQL backend and React/TypeScript/Vite frontend. Select supported stable dependency versions at M0 and pin them with reproducible dependency files; this plan intentionally does not prescribe unverified version numbers.
- Keep Django apps limited to `accounts`, `hymns`, `masses`, and `common`. Place ranking and state transitions in backend services/selectors.
- Use Django sessions with a Vite `/api` proxy locally and a single origin in production. Add a documented CSRF bootstrap endpoint if needed; protect login as well as authenticated writes. Do not assume DRF session authentication alone protects an anonymous login endpoint.
- Use Django's built-in user model and groups for the three roles unless M0 identifies a concrete custom-user requirement. Assign authenticated users without a recognized group read-only access by default.
- PostgreSQL is the development and test database. Do not substitute SQLite for constraint, transaction, or aggregation tests.
- Support the current Windows workspace with PowerShell-friendly instructions. Use Linux containers for production Gunicorn; local Django development may run natively. A Makefile may be a convenience, but cannot be the only documented interface.
- Keep server resources in TanStack Query, filter state in URLs, and transient interaction/form state locally. Unsaved planner edits may use a local working copy with an explicit save lifecycle.

### 3.2 Permissions — planning default

| Action | Viewer | Planner | Admin |
| --- | --- | --- | --- |
| Read library, programs, history, and suggestions | Yes | Yes | Yes |
| Create/edit hymns | No | Yes | Yes |
| Create/edit draft Masses and selections | No | Yes | Yes |
| Finalize drafts | No | Yes | Yes |
| Manage categories and deactivate/reactivate hymns | No | No | Yes |
| Reopen finalized Masses | No | No | Yes |
| Delete unused hymns/categories or draft Masses | No | No | Yes |
| Delete finalized Masses through normal app/API | No | No | No |

Use section 42 of the source to resolve the earlier, less-specific role description. Restrict draft deletion to Admin as a simple conservative default permitted by the source. The application is one shared team workspace; ownership fields record who changed data rather than limiting visibility to the creator.

### 3.3 Classification, validation, and deletion

- Category names are trimmed and case-insensitively unique within their own table. Slugs are unique within that table and stable after renaming. Handle non-Latin names with a deterministic unique slug fallback; never assume ASCII titles.
- Every new hymn requires a nonblank title, one active language, at least one active placement, and a season when it is not season-neutral. Tags are optional; do not introduce an extra required-genre rule. Defer the optional Admin exception for unclassified hymns.
- Validate URLs, positive duration, relationship IDs, and nonnegative ordering server-side. Forms mirror these checks but are not the enforcement boundary.
- Existing inactive relationships remain visible and can be retained during unrelated edits. A retained inactive relationship is not a newly selected one. New selections or new classification links cannot introduce inactive records.
- Reject hard deletion of any hymn or category referenced anywhere, including draft programs and many-to-many links. Offer deactivation instead. Do not cascade-delete usage to satisfy a delete request.
- Historical selections retain their hymn and placement IDs and order. Live label changes may appear in history; immutable title/category snapshots are explicitly unnecessary for version 1.
- Add a database uniqueness constraint on `(mass_id, placement_id, position)`. The same hymn may appear at different positions or placements, with a warning. Do not accidentally add a uniqueness constraint that prevents intentional repetition.

### 3.4 Filters and usage semantics

- Multi-value filters use documented comma-separated IDs. Use AND between dimensions and OR within a dimension. Search is combined with filters using AND.
- Library season filtering is literal: `seasons=Easter` includes explicitly Easter-classified hymns. Season-neutral records are not automatically included. Recommendation eligibility includes season-neutral hymns.
- Default library results to active hymns, alphabetical title, and a stable ID tie-breaker. Page sizes are 25, 50, or 100; filter changes reset the page.
- `usage_count` counts selection occurrences in finalized Masses, as suggested by the source's `Count(selections)` rule. A hymn selected twice in one finalized Mass has a count of two. History displays both occurrences with their placements.
- Global `last_used_date` is the maximum Mass date across finalized selections. Reopening removes that Mass from these derived statistics immediately; re-finalizing restores its contribution once.
- **Future finalized plans:** The source counts all finalized Masses, including future dates. Preserve that rule for global statistics and label future entries as scheduled in the UI. Do not claim a future selection has already been performed. Introducing a separate performed status would require a later product change.
- **Recommendation recency planning default:** Use the target Mass date as the reference date. Only finalized Masses strictly before that date contribute to ranking recency; exclude the target Mass itself. This avoids negative recency and makes backdated planning deterministic. Ranking-specific statistics must be labeled/documented separately from global library statistics.
- Define `used_after` and `used_before` as an inclusive range on finalized usage occurrences; when combined, one occurrence must satisfy both bounds. Define `not_used_since=D` as no finalized occurrence on or after D, including never-used hymns. `never_used=true` means no finalized selections. Validate impossible ranges and invalid IDs.
- For usage-based sorting, explicitly place never-used hymns first for least-recently-used and last for recently-used. Keep a stable title/ID tie-breaker for pagination.

### 3.5 Planner persistence and concurrency — planning default

- Use `PUT /api/v1/masses/{id}/program/` for atomic complete-program saves. Preserve existing selection IDs where possible so retained inactive references and selection identity are distinguishable from additions.
- Add a monotonic Mass revision and require `X-Expected-Mass-Revision`, returning `X-Mass-Revision`, for metadata edits, program saves, finalization, reopening, and draft deletion. M0 selects explicit headers because live labels/warnings can change outside Mass-owned data, so the revision is not a strong HTTP representation ETag. These are small extensions to the source API rather than new product features.
- Serialize autosave requests per Mass; coalesce later changes into the next request. Never let an older response overwrite newer local edits.
- Lock the Mass row, verify revision/status, validate the entire payload, and commit it in one transaction. Invalid entries leave the existing program unchanged. A stale revision returns a documented conflict and never silently overwrites another planner's work.
- Show `Unsaved`, `Saving`, `Saved`, or `Unable to save`. A failed save preserves the working copy and offers retry. Warn before leaving with unsaved work. Full offline editing is outside version 1.
- Disable finalization while pending/failed saves remain. Finalization rechecks the server revision and status in a transaction. Repeat finalize calls on the current finalized revision are harmless; stale requests remain conflicts.
- Retain inactive selections during edits/reopening, but prevent additional inactive selections. Moving an existing row within its retained placement does not re-add the hymn; moving it to a new placement follows new-selection validation.
- Placement or season mismatch requires an explicit warning acknowledgement, not a prohibition. The server enforces active/existing-record rules and returns warning facts; the picker handles acknowledgement. Category changes may create new warnings without deleting the saved selection.

## 4. Milestone roadmap and sizing

Effort is a preliminary estimate in **total engineering days**, including feature tests, review, and documentation. It is not elapsed time and is not a commitment.

| ID | Milestone | Depends on | Engineering days | User-visible result |
| --- | --- | --- | --- | --- |
| M0 | Decisions, contracts, and delivery setup | None | 2–3 | Walkthrough and agreed demo checklist; no app release |
| M1 | Running authenticated application | M0 | 3–5 | Real sign-in and protected application shell |
| M2 | Useful hymn library | M1 | 7–10 | Add, edit, classify, search, and filter hymns |
| M3 | Persistent draft planning | M2 | 7–10 | Prepare and save a multi-placement program |
| M4 | Finalization and trustworthy history | M3 | 5–7 | Complete weekly planning and see usage history |
| Hosting | Render + Supabase deployment | M4 engineering | Reforecast after manual setup | Public HTTPS URL, persistent DB/PDFs and verified automatic deployment |
| M5 | Physical-phone and coordinator acceptance | Hosted URL | Owner scheduling | Real-device results and coordinator pilot; recommendations deferred |
| M6 | Self-service category administration | M5 | 3–5 | Maintain all classifications safely |
| M7 | Dashboard, print, and production readiness | M6 | 6–9 | Complete version 1 and verified release package |
| **Total** | | | **38–56** | |

Allow an additional 20% contingency for discoveries and pilot feedback: roughly 46–67 engineering days. With two available full-stack engineers and part-time QA/product support, plan provisionally for 8–11 calendar weeks because integration, review, and acceptance are partly sequential. Reforecast after M2 with actual throughput. Do not promise dates until team availability is known.

## 5. Detailed milestone execution

### M0 — Make the first implementation unambiguous

**Outcome:** A developer can begin M1 without guessing about permissions, history, or save behavior.

**Work packages**

- **M0.1 — Requirement map:** Map source sections to milestone owners and gates using section 8 below. Record optional features separately.
- **M0.2 — Contracts:** Document the role matrix, filter semantics, retained inactive-record behavior, revision errors, and draft/finalized transitions. Define date-only versus timezone-aware timestamp fields.
- **M0.3 — Architecture:** Confirm user-model choice before initial migrations, dependency versions, same-origin deployment, directory structure, and PostgreSQL tooling.
- **M0.4 — UX walkthrough:** Sketch library, hymn form, planner, picker, and category manager using a restrained cream/burgundy-or-navy palette. Include mobile, keyboard operation, save failure, and empty states.
- **M0.5 — Acceptance fixtures:** Specify fictional hymns with multiple categories, inactive records, neutral seasons, duplicate titles, and contrasting usage dates. Keep test/demo data separate from production category seeds.

**Artifacts:** Initial `docs/architecture.md`, API conventions in `docs/api.md`, backlog ticket IDs, and pilot demo script.

**M0 engineering evidence (October 6, 2026):** Decisions are recorded in [architecture](docs/architecture.md) and [API contract](docs/api.md); package versions in [dependencies](docs/dependencies.md); ownership/tickets in [backlog](docs/backlog.md); sketches/demo in [UX walkthrough](docs/ux-walkthrough.md); fixtures in [acceptance](docs/acceptance.md). The read-only `node scripts/verify-m0.mjs` verifies the static package. Coordinator feedback and actual application tests are not claimed; see [completion report](docs/m0-report.md).

**Gate:** Every planning default has an explicit recorded implementation decision. Each next milestone has an owner and a runnable acceptance scenario. A product walkthrough confirms that classification and recommendation filtering have intentionally different behavior.

### M1 — Running authenticated application

**Review follow-up:** [M1 review](docs/m1-review.md) records the implemented PDF sheet-music uploads, polyphony with multiple voices, numeric duration, compact search/tags, and phone-first layouts, with verification evidence. Coordinator review remains pending.

**Engineering status:** Implemented and verified against real PostgreSQL and desktop/mobile browsers. See [M1 evidence and limits](docs/m1-report.md); [README](README.md) supplies the setup and demo commands. Docker execution and coordinator review remain unverified.

**Usable increment:** An Admin, Planner, or Viewer can log in, navigate the shell, and log out.

**Work packages**

- **M1.1 — Foundation:** Create backend/frontend structure, environment examples, PostgreSQL Compose service, backend container, migrations, and an initial README with native and Docker commands.
- **M1.2 — Authentication:** Implement CSRF bootstrap, login/logout/me endpoints, groups/permissions, first-Admin setup, protected routes, and session expiry handling.
- **M1.3 — Shared interface:** Build AppShell, navigation, accessible buttons/dialog primitives, loading/empty/error components, and centralized typed API/error handling.
- **M1.4 — Verification pipeline:** Configure pytest/pytest-django, Vitest/Testing Library, TypeScript checking, Ruff, ESLint, formatting checks, production frontend build, and OpenAPI generation. Use a local aggregate check command until a CI host is available.
- **M1.5 — Browser smoke:** Introduce Playwright with one real-backend login/logout scenario; use it for critical flows as they become available.

**Demo:** From documented setup, create the first Admin, open the app, log in, refresh, then log out. Check the same shell with a Viewer account.

**Acceptance checks**

- Fresh PostgreSQL setup and migration succeed; no application secrets are committed.
- Unauthenticated reads of application data fail. Unauthorized writes fail server-side even when sent directly.
- Login rejects invalid credentials and missing/invalid CSRF; authenticated writes enforce CSRF. Logout invalidates the session.
- Refresh restores authenticated state; session expiry produces a useful login transition without a blank page.
- The React shell works at desktop and mobile widths with visible keyboard focus.
- Check scripts and the login browser smoke pass. PostgreSQL readiness and migration failures produce understandable setup instructions.

**Not exposed yet:** Library, planner, and settings screens with no functionality.

### M2 — Library pilot: maintain and find real hymns

**Engineering status:** Implemented with real PostgreSQL persistence, secured API/admin, and desktop/mobile browser evidence. See [M2 evidence and limits](docs/m2-report.md). Changes remain uncommitted unless the user explicitly requests a commit. Coordinator review remains pending.

**Usable increment:** The coordinator can enter their library and find hymns using real classifications.

**Work packages**

- **M2.1 — Domain:** Add all five classification models and the complete Hymn schema, normalized relationships, constraints, authorship timestamps, and protective deletes. Configure Django admin.
- **M2.2 — Seeds:** Add an idempotent `seed_initial_data` command with the source's genres, seasons, eleven placements, and languages. Keep stable seed identifiers/slugs; rerunning must not reset user-edited names, order, or active state. Add optional clearly fictional demo data separately.
- **M2.3 — API:** Deliver hymn CRUD/deactivation, category reads and Admin write endpoints, nested category reads/ID-based writes, validation errors, pagination, search, and classification filters. Category API integrity is required now, even though the complete React Settings UI comes at M6.
- **M2.4 — Interface:** Implement library, add/edit form, and hymn detail with all optional metadata. Use desktop tables/mobile cards, searchable multiselects, category chips, URL filters, 300 ms search debounce, sorting, clear-all, and field-level errors.
- **M2.5 — Safety:** Add confirmations for Admin deactivation/deletion, inactive-record visibility, duplicate-title support, and form preservation when saving fails.

**Demo:** Add an Arabic Traditional Easter hymn suitable for Communion and Thanksgiving. Add a neutral-season comparison hymn. Find the first by text and combined filters, edit it, refresh, and deactivate/reactivate it as Admin.

**Acceptance checks**

- Seeding twice produces no duplicates or resets; renamed seed records stay renamed.
- Missing title/language/placement, a nonneutral hymn without seasons, invalid URLs, and nonpositive duration return understandable errors.
- `Traditional AND Communion AND Arabic` returns only matching hymns; `Arabic OR French` works within language. Easter library filtering excludes a neutral-only hymn.
- Search matches title, alternate title, first line, composer, source/hymnal, and tag names without duplicate result rows from joins.
- Pagination has a stable order. URL copy/refresh/back restores filters; clear-all removes them.
- Planner can add/edit but cannot deactivate/delete; Viewer cannot mutate through either UI or API.
- Arabic/Syriac text round-trips and remains readable with appropriate text direction. Do not require full interface translation.
- Failed form saves preserve user input. Detail pages show actual saved metadata and active/inactive relationships.

**Bounded deferral:** Usage columns/recency filters become available at M4. They must be hidden or explicitly unavailable until then, rather than backed by fake values. Categories can be adjusted through their secured API/internal admin until M6.

### M3 — Planning pilot: persistent draft programs

**Engineering status:** Complete through October 8, 2026, including calendar/demo data, random picking, section-scoped scrolling picker, saved view/Edit, visible empty sections, creation Next label, and upcoming/Archived ordering. See [delivery report](docs/m3-report.md) and [latest review](docs/m3-picker-view-review.md). The owner authorized committing M3 and beginning M4. Human walkthrough remains open; physical-phone acceptance is reassigned to M5 by the October 13 priority update.

**Usable increment:** The coordinator can prepare a real Mass program and return to it later.

**Work packages**

- **M3.1 — Domain/API:** Add Mass and MassHymnSelection, draft CRUD/date filters, selection ordering constraints, revision preconditions, and the transactional bulk program endpoint.
- **M3.2 — Planner:** Create Mass by any valid date, optional title/season/notes; generate the specified default title. October 8 review: default to the nearest Sunday and suggest a Maronite season, retaining manual overrides; see [calendar sources and rules](docs/calendar.md). Render active placements from server configuration in display order.
- **M3.3 — Selection:** Deliver an All Hymns picker with search/filters; add/remove multiple hymns per placement, reorder with accessible drag handles, and edit selection notes. Include explicit placement/season mismatch acknowledgement and duplicate warnings.
- **M3.4 — Saving:** Implement serialized/coalesced autosave for metadata and program changes, retryable failures, unsaved navigation warnings, and stale-revision conflict handling that preserves local edits.
- **M3.5 — Program view:** Provide draft list/detail views, saved program preview, and a completion indicator counting filled active placements; empty placements are optional.
- **M3.6 — Random picker (October 8 follow-up):** Fill empty active placements with distinct active hymns matching the selected season or season-neutral classification. Preserve current selections/notes and use the existing autosave queue. Report unmatched placements, cancel obsolete results after date/season changes, and verify retry/reload on desktop and phone widths. See [implementation and checks](docs/random-picker.md).
- **M3.7 — Picker and saved view (October 8 follow-up):** Default choices to the current placement, prioritize selected-season/neutral hymns before pagination, and make the dialog scroll on phones. Save draft waits for all queued writes, then opens a compact read-only program; list links open that view and Edit returns to planning. Preserve failure/conflict recovery and draft status. See [review notes](docs/m3-picker-view-review.md).

**Demo:** Create a non-Sunday Mass, choose its season, add two Communion hymns and an Entrance hymn, reorder them, add notes, refresh, and reopen the same draft from another browser session.

**Acceptance checks**

- All saved metadata, order, and notes survive refresh and backend restart.
- A program payload containing one invalid selection writes nothing; the existing program remains intact.
- Inactive/unknown hymns and newly inactive placements cannot be added. Previously saved inactive rows remain readable and retainable.
- Intentional duplicate hymns and classification mismatches can be saved after soft warnings.
- Rapid successive edits do not lose the last change. Simulate slow responses and a failed save; the UI never displays `Saved` until confirmed.
- Two tabs editing the same revision produce a clear conflict instead of a silent overwrite. The losing tab retains its working copy and can review/reload safely.
- Mass creation allows non-Sunday dates, and suggested seasons can be overridden manually. Within-placement reordering uses drag handles with mouse/touch and keyboard pickup, arrows, drop and cancellation (October 10 review).
- Planner and Admin may edit drafts; Viewer reads only. Admin draft deletion is confirmed.

**Bounded deferral:** Finalization is delivered together with trustworthy history in M4. Do not offer a functioning-looking finalize action before its history semantics exist. The Recommended tab is deferred until the owner reschedules recommendation work.

### M4 — Weekly workflow MVP: finalize and trust history

**Status:** M4.1–M4.5 engineering implemented and verified October 8; coordinator acceptance remains pending; physical-phone acceptance moves to M5; see [M4 report](docs/m4-report.md). M3 is committed as `daefc9b`. M4 changes are not authorized for commit. Coordinator acceptance remains pending; physical-phone acceptance is now an M5 gate.

**Usable increment:** The team can complete a weekly program and answer what was selected previously.

**Work packages**

- **M4.1 — State transitions:** Implement transactional finalize/reopen, `finalized_at`, read-only finalized programs, revision checks, and Admin-only reopening with confirmation.
- **M4.2 — Usage selectors:** Derive occurrence count and maximum finalized Mass date without mutable counters. Prevent many-to-many joins from multiplying counts; use suitable filtered aggregates/subqueries and distinct selection IDs where needed.
- **M4.3 — History API/UI:** Deliver hymn usage endpoint/detail section, newest-first Mass history, date/season/status filters, title/notes search, selection totals, and compact program previews.
- **M4.4 — Library usage:** Add actual usage columns, never-used display, recency filters, all usage sorting options, and friendly/exact date formats.
- **M4.5 — Cache correctness:** After finalize/reopen invalidate the Mass, hymn/detail/history, usage-filtered library, and any affected summary queries. No stale usage remains until a full page reload.

**Demo:** Finalize the M3 program. Verify that its hymn usage appears immediately. Make another draft with the same hymn and confirm counts do not change. Reopen the first program as Admin and verify its contribution disappears, then re-finalize.

**Acceptance checks**

- A hymn used once shows count 1 and the Mass date; two occurrences show count 2. Category joins do not inflate either result.
- Drafts do not contribute; reopen removes contributions; repeat finalization never creates extra selections or usage.
- Direct PATCH/program/delete attempts against finalized Masses fail, including attempts through internal Admin forms/services that could bypass normal views.
- Finalize/save and finalize/reopen races produce a consistent state under PostgreSQL transaction tests.
- Deactivation and category edits leave old selection IDs, notes, and order intact. Referenced hymn/category deletion is rejected.
- Usage date filters use the documented occurrence/range semantics. Future finalized entries receive scheduled wording rather than negative `days ago` text.
- A real-backend browser test covers login → add hymn → create draft → select → finalize → see history.
- **Physical-phone acceptance (required):** A coordinator completes create → pick/scroll → reorder by touch → notes with the keyboard open → Save draft → reopen/Edit → finalize → history on a real phone. Test narrow portrait and landscape, navigation/dialog scrolling, reachable actions, no horizontal overflow, and retry after a connection interruption. Record device, OS/browser, date, results and defects in the M4 report. Cover iOS Safari and Android Chrome where available; mark unavailable devices as pending. Browser width emulation is supporting evidence, not completion of this gate. Include desktop keyboard and Firefox regression checks. Human acceptance remains pending until recorded.

**MVP gate:** A coordinator can carry out the full manual weekly workflow without developer assistance, except category changes. Recommendations and full Settings remain clearly identified as upcoming capabilities.

#
### October 10 browser review

The Mass list now states when the last result has been reached and shows a return-to-top action once Create Mass starts scrolling above the viewport. Search explicitly describes finding saved titles/notes and belongs to the list, rather than the creation form.

Creation is a separate two-step flow: `/masses/new` confirms date, Maronite season, title and notes; Next creates the draft and opens hymn/order selection. Before creation, a fresh inclusive same-date lookup checks all saved plans regardless of list filters/status. Existing plans require explicit confirmation; cancellation or lookup failure preserves inputs and creates nothing. Multiple services on one date remain permitted. This is a client confirmation at the time of checking, not a transactional uniqueness constraint against concurrent creation.

The hymn step shows confirmed details read-only. Back to Mass details and Next switch the same mounted working copy, preserving hymn order, notes and the revision-guarded autosave queue. Each placement's + toggles a compact inline picker with search and a Filters button, scrollable results and metadata (language, placement, season suitability, genres/tags, key, duration, voices and sheet-music availability). Placement filtering and season/neutral preference remain server-side before pagination; mismatch/duplicate overrides and focus restoration remain explicit.

New selection identity uses a browser-session counter rather than the secure-context-only `crypto.randomUUID`. These keys identify unsaved rows locally and never serve as security tokens or database IDs. Both random and manual additions now work on an HTTP LAN origin.

**Deferred owner request — saved program for use during Mass:** recorded October 10; redesign has not started. Revisit the saved view to make it practical for accessing hymns and performing during the service: compact ordered navigation, quick access to lyrics/sheet-music PDFs/voice parts/audio where available, visible performance notes and straightforward movement between hymns. Agree the detailed layout later with the owner, then validate a complete rehearsal on a real phone with materials reachable during Mass. Keep this separate from the implemented planning review and from the physical-phone M5 gate.

## M5 — Assisted planning beta: explainable recommendations

**Usable increment:** The picker suggests suitable, less-recently-used hymns and explains its choices.

**Work packages**

- **M5.1 — Service:** Implement eligibility and a separately testable scoring function, using shared usage selectors with an explicit target-date cutoff. Define weights in one backend module.
- **M5.2 — API:** Deliver the specified per-Mass/per-placement endpoint, genre/language filters, default limit 20, a documented safe maximum, ranking reasons, and clearly defined ranking-context usage fields.
- **M5.3 — Picker:** Add Recommended/All Hymns tabs, reason cards, language/genre labels, never-used/recent-use displays, and manual selection. Do not show score as the primary user-facing explanation.
- **M5.4 — Warnings:** Add warnings for reuse within the current Mass, use on the preceding Sunday, recent use within 30 days, and season/placement mismatch. Show exact dates when useful. Repeated or recent use remains allowed.
- **M5.5 — Refresh behavior:** Recompute suggestions after relevant program, season, category, or hymn changes. If a save is pending, keep the recommendation state consistent or clearly indicate refresh is waiting for that save.

**Initial scoring contract**

| Fact | Points |
| --- | --- |
| Active hymn assigned to requested placement | +50; otherwise ineligible |
| Explicit match to selected season | +30 |
| Season-neutral | +15 |
| Never used before target Mass date | +20 |
| Last eligible usage more than 90 days before target | +15 |
| 61–90 days | +10 |
| 31–60 days | +5 |
| 15–30 days | -10 |
| 8–14 days | -30 |
| 1–7 days | -60 |
| Already selected in current Mass | -100 once per candidate |

Season and neutral bonuses are additive when both facts apply. Never-used and recency bonuses are mutually exclusive. A Mass without a season accepts all active placement-matching candidates, applies no season-match bonus, and displays that season filtering is unavailable. An empty eligible set remains empty with an All Hymns action; do not silently broaden recommendation eligibility.

Order by descending score, then never-used status, oldest eligible last-used date, lower eligible occurrence count, alphabetical title, and finally hymn ID. Generate reasons from the same facts used to rank.

**Demo:** Finalize hymn A on April 12, 2026. Plan Easter Communion for April 19. Show an equally suitable hymn B unused for months above A; show a season-neutral Communion hymn; intentionally choose A despite its warning.

**Acceptance checks**

- Wrong-placement, inactive, and nonmatching nonneutral hymns are excluded. Neutral matching-placement hymns remain eligible.
- Test recency boundaries at 1/7/8/14/15/30/31/60/61/90/91 days; test never-used and current-Mass penalties independently.
- Draft history and finalized dates on/after the target date do not affect recency. Global library statistics retain their separate specified semantics.
- Tie-breakers are deterministic, including duplicate titles. Repeat calls produce the same order for the same facts.
- Reason text agrees with eligibility, recency, and duplicates. Current-Mass state does not falsely become historical usage.
- Recommendation errors are retryable and All Hymns remains available. Soft warnings never prevent a legitimate manual choice.
- A second browser flow verifies that finalizing the first Mass lowers the recently used hymn relative to an equally suitable older-use candidate for the next Sunday.

### M6 — Version 1 candidate: self-service classifications

**Usable increment:** Admins can maintain the vocabulary and placement order through the React application.

**Work packages**

- **M6.1 — Settings:** Deliver a shared CategoryManager across genres, seasons, placements, languages, and tags; add, rename, description, display order, activate/deactivate, and safe delete.
- **M6.2 — Reordering:** Provide accessible up/down controls and an atomic order update. Sort by display order/name with a stable ID tie-breaker. Drag-and-drop is optional.
- **M6.3 — Impact feedback:** Show useful reference/impact information before deactivating an in-use category. Delete errors explain why deactivation is appropriate.
- **M6.4 — Integration:** Update cached choices, classification chips, picker context, planner placement order, and historical labels after category changes.

**Demo:** Add a placement, classify a hymn for it, use it in a draft, rename and reorder the placement, then deactivate it. The existing program remains visible; the placement disappears from new selection choices. Attempt to delete the referenced placement and receive a useful rejection.

**Acceptance checks**

- All five category types support every required operation through UI and API.
- Non-Admin direct requests fail. Case-insensitive duplicate names and duplicate slugs are rejected with field errors.
- No frontend/backend branch depends on a seed category ID or literal category name. A renamed Communion placement still behaves correctly through its relational ID.
- Active filters and saved forms handle deactivated choices without losing existing data. A newly selected inactive language/season is rejected; retained links remain readable.
- Deletion checks include hymn associations, Mass season references, and selection placements in both drafts and finalized programs.
- Seed reruns preserve edited categories. Reordering cannot leave a partially updated category list.
- Renaming labels does not change historical selection membership; historical placement ordering remains governed by current configured order, as snapshots are out of scope.

### M7 — Complete version 1 and make release repeatable

**Usable increment:** The full product is ready for an agreed production environment and normal weekly use.

**Work packages**

- **M7.1 — Dashboard:** Show the next Mass on/after the team-local current date, status, completion, grouped selected hymns, quick search, recent finalized usage, and a small season-suitable suggestions group when context exists. Define same-day ordering by date/ID because version 1 stores no Mass time. No automatic calendar inference.
- **M7.2 — Print:** Add `/masses/:id/print`, using saved program data and print CSS; omit empty placements, show notes appropriately, preserve multiple hymn order, and clearly label drafts.
- **M7.3 — Usability:** Review all major routes at mobile/tablet/desktop widths, keyboard focus/dialog behavior, error associations, readable Arabic/Syriac content, contrast, and loading/empty/failure states. Fix issues found; these qualities must already exist in prior slices.
- **M7.4 — Performance:** Generate a disposable fixture of 5,000 hymns, 2,000 Masses, and 30,000 selections. Measure paginated combined search, usage annotations, history, and recommendations. Add justified indexes/query fixes; no speculative caching framework.
- **M7.5 — Operations:** Package the frontend with a same-origin backend deployment, Linux Gunicorn setup, TLS/reverse-proxy configuration guidance, static assets, health/readiness checks, structured errors/logs, secure session/CSRF cookies, and production `DEBUG=False`.
- **M7.6 — Recovery/docs:** Document backup/restore, pre-migration backup, compatible release rollout, application rollback, and migration recovery. Verify restore into a separate disposable database. Finish architecture/API docs and all thirteen README topics from the source.
- **M7.7 — Pilot/release:** Have a music coordinator complete the acceptance journey, log findings, fix blockers, and prepare release notes with measured results and any limitations.

**Demo:** From a fresh setup, sign in, use the dashboard to prepare a Mass, select recommended and manual hymns, finalize, print the program, inspect history, and update a category as Admin.

**Acceptance checks**

- Dashboard handles no Mass, today's Mass, future draft/finalized Mass, no season, and no history. Upcoming selection excludes dates before the local current date.
- Print preview contains the correct saved date, season, placement/hymn order, and draft/finalized status without clipped text or application controls.
- **Proposed performance budget:** On a recorded reference machine, warmed backend p95 is below 500 ms for common paginated library/history reads and below 1 second for recommendations. Measure at least 100 requests per workload and record hardware, fixture, concurrency, and exclusions. Revisit a missed target explicitly rather than hiding it.
- Query-count checks confirm that a 100-hymn page does not issue per-hymn usage/category queries. Aggregated statistics stay correct with multiple joined dimensions.
- Production configuration passes Django deployment checks; cookies/CSRF, origin handling, permissions, secret isolation, and non-debug error responses are verified.
- Fresh installation, schema migration, category seeding, first-Admin setup, build, and all documented check commands work without undocumented steps.
- Backup restoration reproduces programs and usage totals. A documented rollback does not assume all schema changes are reversible.
- The pilot coordinator completes the core journey within the proposed usability target or a documented follow-up resolves the observed obstacle.

**Release gate:** All required source outcomes are demonstrated. Missing required features prevent the version 1 label. Actual deployment occurs only in the selected, authorized environment; preparing this plan does not deploy anything.

## 6. Working agreements and milestone gates

### Delivery ownership

Assign one accountable delivery owner to each milestone. A backend owner is responsible for models, permissions, transactions, and query behavior; a frontend owner for interactions, forms, and save feedback; QA/product support for realistic scenarios and coordinator feedback. One person may hold multiple roles on a small team.

Split work into reviewable tickets using the work-package IDs above. Each ticket must identify its user outcome, API/schema changes, acceptance cases, dependencies, and evidence. Aim for one to two days of work per ticket; split larger packages without separating away their usable outcome.

Review schema and API contracts before implementation. Backend and frontend work may proceed concurrently once contracts are stable, but milestone acceptance always uses the real backend and database. Temporary mocks are development aids, never gate evidence.

### Definition of ready

- The user outcome and milestone dependency are understood.
- Expected success, validation, permission, empty, and failure behavior is specified.
- API fields, write payloads, and constraints are agreed.
- Test fixtures can distinguish correct behavior from a plausible incorrect implementation.

### Definition of done for every milestone

- All work in the milestone has a functioning frontend-to-database path.
- Changed schema has committed migrations and a verified fresh-database path.
- Relevant automated checks pass; permission and data-integrity failures are covered where applicable.
- Loading, empty, retry, and validation states exist on newly delivered screens.
- Documentation matches actual setup, API behavior, and commands.
- A reviewer reproduces the milestone demo using persisted data.
- No unresolved data loss, privilege escalation, or broken core-flow issue remains. Lesser issues have owners and explicit acceptance for the pilot.
- The milestone is tagged or otherwise recorded as a reproducible checkpoint once source control is established.

Hold a demo at each gate and gather brief coordinator feedback. If it uncovers a broken assumption, adjust the next milestone and reforecast; do not expand into unrelated features.

## 7. Verification strategy

| Layer | Purpose | Essential scenarios | First milestone |
| --- | --- | --- | --- |
| Model/service tests | Enforce business invariants | Uniqueness, relationships, transitions, deterministic ranking boundaries | M2; expand M3–M5 |
| API integration with PostgreSQL | Verify auth, writes, query semantics, transactions | CSRF/role matrix, CRUD, atomic invalid saves, retained inactive records, finalize/reopen races | M1 onward |
| React integration tests | Verify behavior users observe | Field errors, URL filters, picker interactions, failed autosave, warnings, settings | M2 onward |
| Playwright with real backend | Verify core workflows across layers | Login, add/classify, plan/save, finalize/history, next-Sunday ranking | M1 smoke; full flows M4/M5 |
| Hands-on review | Verify practical usability | Keyboard, mobile/touch, bidirectional text, print, coordinator planning session | Every milestone; release review M7 |
| Performance/recovery checks | Verify operational limits | N+1 detection, representative query latency, backup restore | Query review throughout; formal gate M7 |

Use a controllable date/reference clock for recency tests, deterministic fixtures, isolated PostgreSQL databases, and explicit occurrence counts. Include multiple genres/tags/seasons on one hymn to catch join multiplication. Include same hymn twice, same title on different hymns, future finalized programs, reopened Masses, and inactive referenced records.

The required implementation checks are: migration drift check, backend tests, frontend tests, TypeScript checking, Python/TypeScript lint and formatting checks, frontend production build, OpenAPI validation, and the current milestone's browser flows. Define concrete runnable commands in M1 and keep them accurate. Do not add artificial line-coverage targets or brittle component-structure assertions.

For failed browser tests, retain logs/screenshots/traces in the chosen CI system or local run output. Run concurrency tests with true transactions rather than a test wrapper that hides locking behavior. Expand checks when changes or failures warrant it; avoid repeatedly rerunning unrelated suites after a documentation-only change.

## 8. Source requirement coverage

This mapping prevents the shorter roadmap from quietly dropping requirements in the 79-section specification.

| Source sections | Requirement group | Delivery/gate |
| --- | --- | --- |
| 1–3, 79 | Product purpose and independent classifications | M0 decisions; every milestone demo |
| 4–5, 12, 57 | Stack, monorepo, feature boundaries | M0/M1; maintain throughout |
| 6, 42, 72 | Users, role permissions, security | M1 permission baseline; feature checks at each milestone; M7 production review |
| 7–8, 11, 20, 31, 37, 61–62 | Categories, Hymn fields, constraints, seeds, validation, protection | M2 backend foundations; M3/M4 reference behavior; M6 Settings UI |
| 9–10, 21, 23, 55 | Mass/selection models, planning, persistence, completion | M3 |
| 13.1 | Authentication API | M1 |
| 13.2–13.3, 18–19, 35, 63–64, 67–68 | Hymn/category API, library/detail, pagination, filters and serialization | M2; usage additions M4; complete category interface M6 |
| 13.4–13.5 | Mass API, bulk atomic selection saves | M3; finalize/reopen M4 |
| 13.6, 14–15, 22, 58 | Recommendation service/API, picker, warnings | Manual picker/warnings M3; ranking and recency M5 |
| 24–25, 59–60 | Finalization and finalized-only usage/history | M4 |
| 13.7, 17 | Dashboard | M7, using M4/M5 services |
| 16, 27–30, 54, 69 | Navigation, visual design, responsive UI, accessibility and screen states | M1 primitives; every delivered screen; M7 review |
| 26 | Full application category Settings | M6 |
| 32, 52–53 | Optional import/export and future scope | Explicit deferral in section 2; revisit after version 1 |
| 33, 36, 38–40, 65–66, 70–71 | Audit fields, dates, errors, API client, types, state, save feedback/logging | M1–M3 foundations; integrate in every feature |
| 41, 56 | Routes and print-friendly program | Routes with each feature; print M7 |
| 43 | Destructive-action confirmations | M2, M3, M4, M6 as actions appear |
| 34 | Performance at expected volume | Query design M2 onward; M7 measured gate |
| 44–46 | Backend/frontend/browser tests | M1 tooling; progressive suites M2–M6; M7 release checks |
| 47–51, 73–74 | Developer experience, environment, Docker, README, demo data, admin, migrations | M1 setup; M2 seeds/admin; update each milestone; M7 clean-room verification |
| 75–76 | Implementation sequence and execution discipline | This plan refines phases into usable gates; checkpoints in section 6 |
| 77–78 | Version 1 completion and central user journey | M4 manual workflow, M5 assisted flow, M7 complete release gate |

The original phases are preserved in substance: foundation, hymn domain, planning, history, recommendations, full settings, and completion. Two deliberate refinements improve usability: protective category APIs arrive with the library, and finalization ships together with history rather than ahead of it.

## 9. Risks and practical controls

| Risk | Control | Verification point |
| --- | --- | --- |
| An attractive screen hides incomplete persistence | Gate on refresh/restart and real-backend demos | M2 onward |
| Autosave or multiple tabs overwrite work | Serialized saves, revision preconditions, row locking, retained working copy | M3 |
| Finalization races with a save | Shared revision/status checks and transactional transitions | M4 |
| Category joins inflate usage counts | Carefully isolated aggregates/subqueries and multi-category fixtures | M4 |
| Future finalized plans appear as completed use | Scheduled labels; separate target-date ranking context; explicit source limitation | M4/M5 |
| Deactivation makes old programs disappear | Protective references and retained inactive-choice rules | M3/M4/M6 |
| Seed reruns undo Admin changes | Stable seed identity and create-only/idempotent defaults | M2/M6 |
| Arabic/Syriac content breaks forms or layout | Unicode round-trip, sensible direction handling, mixed-language tests | M2/M7 |
| Native Windows instructions assume Linux Gunicorn | Document native development separately from Linux production container | M1/M7 |
| Polish and security are postponed too long | Shared foundations and per-feature checks; M7 closes remaining issues | Every gate |
| Estimates expand because optional features creep in | Fixed version 1 gate and an explicitly deferred backlog | Every demo |

## 10. Version 1 release checklist

- [ ] Every required row in the coverage map has demonstrable acceptance evidence.
- [ ] Admin, Planner, and Viewer workflows and direct API permissions pass.
- [ ] All Hymn metadata, independent relationships, literal filters, pagination, and usage sorts work.
- [ ] Admins manage all five category types through Settings; referenced data is protected.
- [ ] Multi-hymn draft programs, order, notes, autosave, conflict handling, and retry work.
- [ ] Finalize/reopen are explicit and safe; drafts never count in historical statistics.
- [ ] Recommendations follow documented eligibility, weights, dates, tie-breakers, and explanations.
- [ ] Manual selection and soft-warning overrides remain available.
- [ ] History, dashboard, and print show correct saved programs.
- [ ] Mobile, keyboard, screen states, and Arabic/Syriac content pass review.
- [ ] Appropriate automated checks, clean setup, deployment configuration, and restore rehearsal pass.
- [ ] README, environment examples, architecture/API docs, release notes, and known limitations are current.
- [ ] Coordinator acceptance is recorded; no unresolved required-feature or data-integrity blocker remains.

**Current acceptance action:** Complete the required M4 coordinator and physical-phone acceptance gate for the verified guarded finalize/reopen and finalized-only usage/history increment. M3 is saved at `daefc9b`; M4 remains uncommitted. Recommendations remain M5 and are not yet started.

### October 10 picker refinement

Sortable desktop metadata, compact phone controls/cards, sidebar collapse and drag/keyboard hymn ordering are implemented as owner review follow-ups. Neutral suitability suppresses both picker and program season notices. See [implementation and evidence](docs/picker-review.md). M4's physical-device gate remains pending; this refinement does not advance M5 recommendations or the deferred saved-program performance design.
