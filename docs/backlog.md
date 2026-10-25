# Delivery backlog and accountability

> **October 20, 2026 — Accounts and choirs:** Self-service email verification, recovery, choir membership and choir-specific hymn counts supersede the shared-workspace rules below. See [account and choir setup](accounts-and-choirs.md). Existing local data is preserved in Initial choir. Registration and mandatory legacy verification ship disabled pending owner email setup. Hosting checks: core flows accepted, records persist; PDF persistence and CI-gated deployment remain pending.


> **October 13, 2026 priority update:** Render + Supabase hosting preparation is the current delivery task; see [deployment guide](hosting.md). All account/login/provider setup and publishing are manual owner steps deferred until later. Physical-phone acceptance moves from M4 to M5. Saved-Mass performance redesign and recommendations are deferred. Historical milestone statements below retain their original dates; hosted completion requires actual URL, persistence and pipeline verification.

**Baseline:** October 8, 2026. M0–M3 engineering work and requested M3 follow-ups are complete. The owner authorized the M3 commit and beginning M4. M4.1–M4.5 engineering is implemented and verified; M4.6 acceptance is pending. M5–M7 have not started. Container execution and coordinator review remain pending; physical-phone acceptance is an explicit M4 gate.
**Accountable implementation owner for every milestone:** Codex, working in this project/chat. Backend, frontend, and quality roles below are responsibility areas for that owner, not invented staffing assignments. Implementation was not delegated; the owner requested one read-only subagent review of M2 changes.
**Product reviewer:** Church music coordinator, not yet assigned; human acceptance remains pending.

Follow the [development plan](../DEVELOPMENT_PLAN.md) for complete milestone gates and estimates, [architecture](architecture.md) for resolved choices, and [API contract](api.md) for payload/error details. A work package is split into smaller tickets when it exceeds one or two working days.

## M0 completed packages

| Ticket | Responsibility | Evidence |
| --- | --- | --- |
| M0.1 Requirement map | Delivery/quality | Source coverage map in plan and [requirements.json](requirements.json); verifier checks all 79 sections |
| M0.2 Contracts | Backend/frontend | Architecture ADR-002 through ADR-007; API request/error/revision examples |
| M0.3 Architecture/dependencies | Backend/tooling | Runtime/peer metadata checked; exact [baseline](dependency-baseline.json); install constraints recorded |
| M0.4 UX walkthrough | Frontend/product | Five screen sketches, mobile/failure states, [demo script](ux-walkthrough.md) |
| M0.5 Acceptance fixtures | Quality | [Symbolic fixture](fixtures/m0-scenarios.json), expected results, read-only verifier |

## M1 — Authentication preview

**Review fixes:** [M1 review](m1-review.md) records five completed engineering tickets: M1.R1 PDF sheet music, M1.R2 polyphony and multiple voices, M1.R3 numeric duration, M1.R4 compact search/tags, and M1.R5 phone-first usability, with acceptance criteria and verification evidence. Coordinator review remains pending. Phone use is the primary design and review priority for subsequent milestones too.

**Status:** Implemented. [Completion report](m1-report.md) records the original 27 backend, 8 frontend, and 6 real-browser checks and operational limits. The tickets below describe the delivered scope.

**Depends on:** M0. **Acceptance scenario:** A01. **Pilot evidence:** Verified clean database setup, login/logout, CSRF failures, role resolution, protected shell, real-browser smoke. No feature placeholders.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M1.1 Foundation | Tooling/backend | M0.3 | Project-local environments/caches, resolved dependencies, PostgreSQL Compose/backend container, settings/migrations, accurate commands |
| M1.2 Authentication | Backend | M1.1 | User/group provisioning, explicit login CSRF, me/logout, role-policy tests including ungrouped user |
| M1.3 Shared interface | Frontend | M1.1; M1.2 contract | Responsive shell, typed client, session expiry, accessible shared states |
| M1.4 Verification pipeline | Quality/tooling | M1.1 | Backend/frontend checks, typing/lint/build, OpenAPI validation |
| M1.5 Browser smoke | Quality | M1.2–M1.4 | Real-backend login, refresh, logout, Viewer shell |

## M2 — Library pilot

**Status:** Implemented. [Completion report](m2-report.md) records library delivery and acceptance evidence. Models, seeds, API, interface, and safety tickets below are complete. The coordinator can enter real hymns and use the M3 draft planner.

**Depends on:** M1. **Acceptance scenarios:** A02–A04. **Pilot evidence:** Enter/edit/classify real records; URL search/filter persistence; inactive/permission and seed behavior.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M2.1 Domain | Backend | M1 | All Hymn fields, five classifications, constraints/protection, migrations/admin |
| M2.2 Seeds | Backend | M2.1 | Idempotent production category seed; separate fictional demo seed; no password seeds |
| M2.3 API | Backend | M2.1–M2.2 | Hymn CRUD, category API, validation, literal combined filters, pagination |
| M2.4 Interface | Frontend | M2.3 contract | Library/form/detail, Unicode, URL state, mobile cards, all optional metadata |
| M2.5 Safety | Frontend/quality | M2.3–M2.4 | Admin confirms destructive actions; input retained on errors; permission checks |

Usage fields/filters wait until M4 and must not be presented as real data earlier. Category writes work through secured API/internal admin until React Settings in M6.

## M3 — Draft planning pilot

**Status:** Complete through October 8, including all requested reviews; approved for the M3 checkpoint by the owner. See [delivery report](m3-report.md) and [latest review](m3-picker-view-review.md). M2 is recorded at `aada303`; M3 is committed as `daefc9b`. Coordinator walkthrough and physical-phone acceptance carry into the M4 gate.

**Depends on:** M2. **Acceptance scenarios:** A05–A07. **Pilot evidence:** Saved two-hymn Communion section, order/notes persisted, no data loss during rapid edits/failure/conflict.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M3.1 Domain/API | Backend | M2 | Mass/selection migrations, revision guards, atomic full-program update |
| M3.2 Planner | Frontend | M3.1 contract | Date/manual season/title/notes; configured ordered sections |
| M3.3 Selection | Frontend/backend | M3.2 | All Hymns picker, multiple rows, notes/up-down, suitability/duplicate warnings |
| M3.4 Saving | Frontend/backend/quality | M3.1–M3.3 | Serialized/coalesced autosave, preserved edits, two-tab conflict, transactional tests |
| M3.5 Program view | Frontend | M3.2–M3.4 | Draft list/detail, completion count, retained inactive sections |
| M3.6 Random picker | Backend/frontend/quality | M3.1–M3.4 | Implemented October 8: fill empty placements with distinct active season/neutral matches; preserve selections/notes; autosave/retry; report unmatched placements. See [implementation](random-picker.md). |
| M3.7 Picker and saved view | Backend/frontend/quality | M3.1–M3.6 | Section-scoped picker, season/neutral preference before pagination, scrollable phone dialog; Save draft waits for autosave then opens compact read-only detail; Edit reopens planning. See [review](m3-picker-view-review.md). |

Completed list/view refinements also include **Next** for creation, **Hymn not selected** for empty saved sections, and upcoming-nearest/Archived-past grouping.

Finalization appears only with history in M4; recommendations only in M5.

## M4 — Weekly workflow MVP

**Status:** M4.1–M4.5 implemented and verified, uncommitted; see [M4 report](m4-report.md). M3 checkpoint: `daefc9b`. M4.6 human/physical-phone acceptance remains pending.

**Depends on:** M3. **Acceptance scenarios:** A08–A10 and required physical-phone A10P. **Pilot evidence:** Full manual journey and derived usage under finalize/reopen/re-finalize and concurrency.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M4.1 Transitions | Backend | M3 | Transactional finalize/reopen, guarded admin/services, finalized read-only |
| M4.2 Usage selectors | Backend/quality | M4.1 | Correct occurrence counts/max date, no join inflation, no mutable counters |
| M4.3 History | Backend/frontend | M4.2 | Hymn usage and Mass history with filters/previews |
| M4.4 Library usage | Frontend/backend | M4.2 | Usage columns, literal recency filters, all sorting, scheduled labels |
| M4.5 Cache correctness | Frontend/quality | M4.3–M4.4 | Immediate usage refresh; real-browser full-flow test |
| M4.6 Physical-phone acceptance | Product/quality | M4.1–M4.5 | Required real-device create/picker/touch reorder/keyboard/save/edit/finalize/history journey; connection retry; record device/browser/results. iOS Safari and Android Chrome where available; unavailable coverage remains pending. Emulation does not close the gate. |

### October 10 browser review

The Mass list now states when the last result has been reached and shows a return-to-top action once Create Mass starts scrolling above the viewport. Search explicitly describes finding saved titles/notes and belongs to the list, rather than the creation form.

Creation is a separate two-step flow: `/masses/new` confirms date, Maronite season, title and notes; Next creates the draft and opens hymn/order selection. Before creation, a fresh inclusive same-date lookup checks all saved plans regardless of list filters/status. Existing plans require explicit confirmation; cancellation or lookup failure preserves inputs and creates nothing. Multiple services on one date remain permitted. This is a client confirmation at the time of checking, not a transactional uniqueness constraint against concurrent creation.

The hymn step shows confirmed details read-only. Back to Mass details and Next switch the same mounted working copy, preserving hymn order, notes and the revision-guarded autosave queue. Each placement's + toggles a compact inline picker with search and a Filters button, scrollable results and metadata (language, placement, season suitability, genres/tags, key, duration, voices and sheet-music availability). Placement filtering and season/neutral preference remain server-side before pagination; mismatch/duplicate overrides and focus restoration remain explicit.

New selection identity uses a browser-session counter rather than the secure-context-only `crypto.randomUUID`. These keys identify unsaved rows locally and never serve as security tokens or database IDs. Both random and manual additions now work on an HTTP LAN origin.

**Deferred owner request — saved program for use during Mass:** recorded October 10; redesign has not started. Revisit the saved view to make it practical for accessing hymns and performing during the service: compact ordered navigation, quick access to lyrics/sheet-music PDFs/voice parts/audio where available, visible performance notes and straightforward movement between hymns. Agree the detailed layout later with the owner, then validate a complete rehearsal on a real phone with materials reachable during Mass. Keep this separate from the implemented planning review and from the physical-phone M5 gate.

## Hosting and M5 acceptance — current priority

Hosting configuration and the manual/pipeline guide are prepared; actual provider setup and H2/H3 hosted acceptance are manual owner tasks deferred until later. See [hosting guide](hosting.md) and [verification](hosting-report.md). M5 now covers physical-phone/coordinator acceptance on the hosted URL (A10P); the recommendation tickets below are deferred, not the next implementation task.

## Deferred recommendations — formerly M5 assisted planning beta

**Depends on:** M4. **Acceptance scenarios:** A11–A13. **Pilot evidence:** Exact scores/reasons, recency boundary table, next-Sunday ranking, manual override.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M5.1 Ranking service | Backend/quality | M4 | Target-date history, eligibility, score/reasons/ties, boundary tests |
| M5.2 API | Backend | M5.1 | Limited ranked endpoint, genre/language filters, context notice/statistics |
| M5.3 Picker | Frontend | M5.2 contract | Recommended and All Hymns, readable reasons, empty/retry states |
| M5.4 Warnings | Backend/frontend | M5.1–M5.3 | Recent/preceding-Sunday/duplicate/suitability facts, overridable choices |
| M5.5 Refresh | Frontend/quality | M5.3–M5.4 | Pending-save behavior, context invalidation, real-browser second-Sunday flow |

## M6 — Self-service categories

**Depends on:** M5. **Acceptance scenarios:** A14–A15. **Pilot evidence:** All five category managers work; rename/reorder/deactivate preserves history.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M6.1 Settings | Frontend | M2 category API; M5 gate | Shared manager/forms for five types |
| M6.2 Reordering | Backend/frontend | M6.1 | Atomic reorder; keyboard/touch controls; full membership validation |
| M6.3 Impact feedback | Backend/frontend | M6.1 | Reference counts, delete rejection, deactivation confirmation |
| M6.4 Integration | Frontend/quality | M6.1–M6.3 | Active choices refresh, saved inactive labels remain, seed replay |
| M6.5 Calendar settings | Backend/frontend | M6.1; Maronite date adapter | Select calendar/timezone; edit local season/date overrides with preview; expose provider/refresh status; preserve saved plans. Requested October 8; see [calendar notes](calendar.md). |

## M7 — Complete version 1

**Depends on:** M6. **Acceptance scenarios:** A16–A18. **Pilot evidence:** Dashboard/print, usability session, measured performance, fresh setup and restore rehearsal, release checklist.

| Ticket | Responsibility | Depends on | Deliverable/check |
| --- | --- | --- | --- |
| M7.1 Dashboard | Backend/frontend | M4/M5 services; M6 | Upcoming/current-day program, quick search, recent usage/suggestions |
| M7.2 Print | Frontend | M6 | Saved-program print route, order/notes, clear draft label |
| M7.3 Usability | Frontend/quality | M7.1–M7.2 | Mobile/keyboard/dialog/text-direction/state review fixes |
| M7.4 Performance | Backend/quality | M6 | Representative fixture, measured queries, justified indexes |
| M7.5 Operations | Tooling/backend | M6 | Production package/configuration, health, secure cookies, no debug leaks |
| M7.6 Recovery/docs | Tooling/quality | M7.5 | Clean setup, backup restore, rollout/rollback instructions |
| M7.7 Pilot/release | Delivery/product | M7.1–M7.6 | Coordinator acceptance, no required blockers, release notes |

## Deferred until all other planned work is complete

**F1 — Parish/choir account membership and collaborative Mass lists**  
**Requested:** October 6, 2026. **Status:** Recorded for much later; implementation has not started.  
**Scheduling gate:** All other planned work complete, including M0–M7 and the version 1 release gate.

- Accounts belong to a parish and a choir.
- The people responsible for a choir can collaboratively edit that choir's Mass list.
- Before implementation, define membership rules, how choir responsibles are assigned, access boundaries between parishes/choirs, and handling of concurrent edits. These details remain open; do not expand current milestones to implement them.

## Ready-to-start M1 checklist

- [x] Architecture and permission decisions recorded.
- [x] Authentication/error/revision conventions defined.
- [x] Runtime and direct dependency versions selected from primary sources.
- [x] Compatibility mismatch resolved without ignoring peer requirements.
- [x] Deterministic fixtures and next-milestone acceptance script supplied.
- [x] Documentation standards and project-only write boundary recorded.
- [x] Establish working Python/npm/PostgreSQL tooling within the permitted boundary during M1.
- [ ] Assign a coordinator and gather product walkthrough feedback; this remains external review, not a claimed completed acceptance test.

No approved deployment target, timeline commitment, or human staffing assignment is implied by this backlog.

## October 10 picker review — delivered, uncommitted

- Aligned search and Filters; replaced gold search focus with a burgundy inset indicator. Language/genre/sort stay on one compact row at phone widths.
- The sidebar music mark collapses/restores desktop navigation; collapsed links retain accessible names.
- Desktop suggestions use sortable metadata columns; phones retain compact cards and a sort selector. Whole-result ordering preserves season/neutral preference before pagination.
- Any-season choices bypass season notices in both selection and program warnings. Explicit other-season metadata remains visible and advisory; existing hymn classifications were not changed.
- Mouse/touch drag handles replace hymn reorder arrows. Keyboard pickup/move/drop/cancel remains available. Drop commits once using the latest working copy, preserving selection IDs, notes and other placement order; cancellation preserves saved order.

See [picker review](picker-review.md) for contracts and verification. Saved-program performance redesign remains deferred, and real-phone acceptance is scheduled for M5.

## October 20 performance UI and deferred language settings

The saved-program reading surface has now been brought forward by the owner: focus-mode PDF/lyrics/title reading, swipe/keyboard navigation and screen-awake lifecycle are implemented locally. This supersedes the earlier "redesign has not started" note; further reader refinements and physical-device acceptance remain pending. See [delivery and ordered UI improvement plan](ui-performance-review.md).

**F2 — Language settings and full Arabic translation (deferred).** Add an English/Arabic preference, persist the signed-in user's choice with a pre-login fallback, translate all UI and validation/accessibility strings, localize date/count formatting, and support RTL throughout. Preserve hymn text as authored and native/Latin-title search. Complete only after mixed-script, keyboard, screen-reader, PDF and real-phone coverage in both languages. No account/settings migration is introduced until this feature is scheduled.
