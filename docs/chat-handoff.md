# Conversation handoff — October 8, 2026

> **October 13, 2026 priority update:** Render + Supabase hosting preparation is the current delivery task; see [deployment guide](hosting.md). All account/login/provider setup and publishing are manual owner steps deferred until later. Physical-phone acceptance moves from M4 to M5. Saved-Mass performance redesign and recommendations are deferred. Historical milestone statements below retain their original dates; hosted completion requires actual URL, persistence and pipeline verification.


Source chat: **Plan parish choir collaboration**, thread `01a112a3-21c7-7151-96f4-e0ebfdcd1933`.
Imported into the current Choralation chat at the project owner's request. All six source turns were read; there were no further pages. The companion [message archive](chat-history-2026-10-08.md) preserves the available user and assistant messages in chronological order. This is a context handoff, not a merge of application chat history or an assertion that hidden model memory was accessible. Command logs and internal reasoning are not copied.

## Standing project instructions

- Work only inside `C:\Users\t.lattouf\Projects\Choralation`; keep tooling, logs, temporary files, uploads, and generated artifacts there.
- Do not stage or commit unless the owner specifically asks. On October 8 the owner explicitly authorized the completed M3 checkpoint and starting M4; that authorization does not include committing subsequent M4 changes.
- Keep code documented and the UI simple and intuitive. Phones are the primary device; retain desktop usability and readable Arabic/Syriac content.
- Historical requests to delegate a particular code review are recorded in the archive. They do not request a new review or new agents during this handoff.

## Current delivered state

**Current M4 progress:** M3 was committed as `daefc9b` on October 8. M4 lifecycle, finalized-only usage, history/filter/sorting and cache refresh are implemented and verified (163 backend, 46 frontend tests; six distinct browser journeys across combined runs). They remain uncommitted. Required coordinator and real-phone acceptance remain pending; see the [M4 report](m4-report.md). This supersedes historical statements below that M4 was unstarted.

**October 8 checkpoint:** M3 and all requested review changes are complete and authorized for commit. M4 may now begin. Physical-phone testing is an explicit M4 acceptance criterion; human acceptance is still pending. Dated test counts and uncommitted-state references below retain their historical context. See the [current plan](../DEVELOPMENT_PLAN.md), [backlog](backlog.md), and [latest review](m3-picker-view-review.md).

M0 foundations, M1 authentication/roles, M2 hymn library, and the five M1 review items are delivered. Review items cover private PDF sheet music, polyphony with named voices, numeric duration in minutes, compact search/tags, and phone-first forms.

The source chat added and fixed two M2 review findings:
- Background hymn/category refetch failures keep forms mounted, preserving unsaved metadata, voices, and chosen PDFs; retry is available.
- Docker media storage is configured as writable and persistent at `/app/media`, with backup instructions. Docker execution remains unverified because Docker was unavailable.

M2 and its review fixes were explicitly committed as **`aada303` — Complete M2 hymn library and review fixes**. The owner then clarified that “begin M2” meant **begin M3 draft planning**.

## M3 draft planning

Implemented models/migration, protected hymn/category references, API, and frontend:
- Authenticated paginated Mass lists, search and date/season filters.
- Draft creation with any date, manually chosen optional liturgical season, optional title/notes; blank title generates a date-based title.
- Multiple hymns per placement, ordering, selection notes, removal, active-placement completion counts, and retained inactive selections.
- Hymn picker with search, pagination, language/genre filters, title/newest sorting, and explicit duplicate/suitability warning acknowledgement.
- Compact optional fields/filters and focused warning actions; saved warnings identify the hymn and context.
- Serialized/coalesced autosave, visible save states, manual Save now, failure recovery, and preserved newer local edits and acknowledged selection identities.
- Shared monotonic Mass revision, row locking, atomic metadata/program endpoints individually, and explicit conflict review/discard/reload instead of silent overwrites.
- Navigation/sign-out guards, read-only Viewer behavior, confirmed Admin draft deletion, read-only Django admin inspection.
- Lazy page loading and scoped browser-test cleanup.

The full read-only M3 review found three issues, all subsequently fixed at the owner's request:
1. Apply server-generated/canonical titles only to fields unchanged since the request; retain newer local edits and use canonical metadata as the next saved baseline.
2. If unmounted during metadata PATCH, stop the queued program PUT; an already-started request may settle.
3. Reconcile refreshed hymn/placement references and warnings without replacing local metadata, order, row identities, or notes. Older reference timestamps cannot replace newer ones.

M3 remains **uncommitted**. [M3 report](m3-report.md) contains the implementation and verification details.

## Verification inherited from the source chat

These are historical results, not new test runs performed during the handoff:
- M2 review fixes: 79 backend and 16 frontend tests; migration/schema/lint/format/type/build checks passed.
- M3: 98 backend tests including 19 draft/permission/atomicity tests and a real two-connection PostgreSQL race.
- Before review fixes: 21 frontend tests and the complete 18-case desktop/mobile browser suite passed.
- After review fixes: 26 frontend tests, all eight M3 desktop/mobile browser cases, typing/lint/format/build passed.
- Actual HTTP backend stop/start preserved Mass metadata, revision, selection identity/order/notes, and session; its temporary records were cleaned up.
- Desktop/mobile screenshots inspected. Physical phones, Safari/Firefox, Docker/Linux, production/recovery, and M7 performance gates remain unverified. Production build has a shared-entry size warning; further measurement is scheduled for M7.

## Scope and next work

Next planned milestone: **M4 finalization and trustworthy history**. Implement revision/status-guarded finalize/reopen transitions and finalized-only usage together. Drafts must not count in history. Recommendations remain M5, complete category Settings M6, dashboard/print/release/performance work M7. The subsequent October 8 owner request now authorizes starting M4.

Much later, **after all other planned work and the version 1 release**, add:
- Accounts belonging to a Parish and Choir.
- Choir responsibles collaboratively editing their choir's Mass list.

These remain deferred in the development plan/backlog. Current M3 conflict handling is not parish/choir membership or automatic collaboration merging. Offline durable storage and cross-tab merging also remain deferred.

## Local running and manual testing

**Latest list follow-up:** Masses are ordered today/upcoming nearest first, then past Masses most recent first under **Archived**. The API computes `is_archived` using the team day and orders before pagination. Archive grouping does not change draft status, revisions or edit permissions. See [review notes](m3-picker-view-review.md).

**Latest picker/view follow-up:** `/masses/:id` now opens a compact saved view; use **Edit** to reach `/masses/:id/edit`. New Mass creation opens the editor. **Save draft** replaces the editor's earlier Save now action and waits for queued/in-flight writes before returning to the view. The picker defaults to the section and ranks selected-season/neutral hymns first before pagination; **Search all placements** is an explicit advanced override. The dialog now owns its scrolling. See [review notes](m3-picker-view-review.md). Saving retains draft status, and M4 remains unstarted.

**October 8 random picker:** The draft planner now offers **Random hymns**, which fills empty active placements from the selected season and neutral hymns while retaining existing choices and avoiding repeats. Suggestions use the normal autosave pipeline. See [implementation and test evidence](random-picker.md). This adds no usage/ranking or M4 lifecycle work. Changes remain uncommitted.

**October 8 follow-up:** [M3 UI review](m3-ui-review.md) records the subsequently delivered compact planner, Maronite calendar suggestions and requested 36 demo hymns. [Calendar notes](calendar.md) supersede the earlier manual-only UI default and track the Settings follow-up. M4 remains next and unstarted.

Use project-local portable Windows tooling, PostgreSQL port 55432, Django 8000, Vite 5173. Launch with `dev.cmd` to avoid saved PowerShell policy changes. Existing accounts and user records must be preserved; no default password is committed.

See the [README](../README.md), [development plan](../DEVELOPMENT_PLAN.md), and [M3 report](m3-report.md). Manual testing starts at `http://127.0.0.1:5173/`: sign in, use Hymn library and Mass plans, create/edit a draft, and wait for Saved before leaving.

**October 10 phone connection follow-up:** Physical Safari still times out on the
LAN URL despite wildcard listeners and successful computer-side checks. Read-only
policy evidence identifies a likely Public-profile inbound firewall blocker; the
owner's instruction to leave firewall settings unchanged persists. The owner
approved a temporary Cloudflare HTTPS tunnel restricted to their provided email.
During that historical session it fronted a separate built preview (loopback 5174) and HTTPS-aware private
backend (loopback 8001), using the same loopback database. The existing LAN dev
pair remains running. Public email gating, built-page delivery, API readiness,
Secure cookies and valid/rejected CSRF origins were checked. Actual phone sign-in
and M4 acceptance remain pending. Session URL/PIDs/helpers/logs are in ignored
.cache; see [phone testing](phone-testing.md) for details and stopping instructions.
No .env, firewall, Windows service, or system settings were changed; no commit was
made. The login heading's missing space was also fixed and included in this build.

## October 10 browser review and phone work paused

The owner deferred phone connection testing and declined any clock adjustment. Do not resume tunnel/time/firewall work without a new request. Continue manual browser feedback at `http://192.168.1.95:5173`. The planning review adds the two-step details/hymns flow, same-date confirmation, list navigation cues, HTTP-safe local row identities and compact inline hymn picker. See [M4 report](m4-report.md) for current verification. Saved-program performance usability is explicitly deferred in the backlog; do not redesign it yet. No changes were staged or committed.

## Latest October 10 picker review

Desktop suggestions now use server-sorted metadata columns, phones use compact cards, picker controls align and filters share one row. Sidebar collapse and mouse/touch/keyboard drag reordering are implemented. Any-season suppresses advisory season notices regardless of retained links; explicit other-season notices remain. Source changes are documented in [picker review](picker-review.md). Engineering checks passed 198 backend and 58 frontend tests plus schema/migration/type/lint/format/build checks; browser evidence is recorded in that report. No changes were staged or committed. Physical-device M4 acceptance and saved-program performance redesign remain pending.

## Latest Mass list refinement

Ready Masses now defaults to finalized programs; Pending drafts includes saved drafts until finalization. Compact search/Filters icon and arrow-only return-to-top are implemented. URL lifecycle filtering runs before API pagination; clearing filters retains the chosen list. See [Mass list review](mass-list-review.md) for current verification. Keep all work uncommitted and manual browser data isolated from test fixtures.

Mass-list verification is complete: 198 backend and 61 frontend tests, schema/type/lint/format/build checks, plus 28 distinct browser cases across combined corrected runs. See [the evidence report](mass-list-review.md) for initial failures and targeted reruns. Disposable test databases were removed; manual services remain running. Physical phone acceptance and the deferred saved-program performance redesign remain pending.

## Cloudflare removed at the owner’s request

The Cloudflare connector and its private preview/backend have been stopped. The project-local client, operational helpers and runtime origin/session files were removed; diagnostic logs remain as historical evidence. Local HTTP frontend `http://192.168.1.95:5173` and backend port 8000 remain running, with successful computer-side login-page/readiness checks. Ports 5174 and 8001 no longer listen. Do not restart Cloudflare without a new owner request. No firewall, clock or external account settings were changed. This cleanup is uncommitted.

## Latest details/table/finalization refinement

Equal date/season heights, stacked title/notes, 728 px desktop table with page scrolling, plain drag icons and direct inline finalization are implemented. Conflicts still require refreshed-program acknowledgement; Admin reopen retains confirmation. See [the refinement report](planning-refinement.md) for current checks. Cloudflare remains removed; manual services stay running and all changes remain uncommitted.

Refinement verification is complete: 198 backend tests, 62 frontend tests, 28 browser cases across desktop and 360/390/430 px, plus schema/type/lint/format/build checks. The finalization UI is direct and inline; Admin reopening still confirms its impact. Isolated browser fixtures were cleaned up. Physical-device acceptance remains pending; no changes were staged or committed.


## October 11 final row controls and regression run

Drag grips now appear only for sections with multiple hymns; Edit/Remove are smaller (40 px), side by side at every width, and singleton rows use the space vacated by the grip. Saved status is burgundy. The fresh full check passed **198 backend and 62 frontend tests** plus schema/migration/type/lint/format/build gates. **44 browser cases passed without failures** across the completed isolated sequence, covering every spec at desktop/390 px plus focused picker/creation/list cases at 360/430 px. See [the refinement report](planning-refinement.md) for exact run artifacts and coverage.

Disposable browser databases/accounts were cleaned up; manual app services remain running. Changes are uncommitted. Real-device acceptance and the deferred saved-program performance redesign remain pending; Cloudflare remains removed and firewall/clock settings are unchanged.

## Hosting preparation — October 13, 2026

Render/Supabase preparation is implemented and locally verified. See [hosting report](hosting-report.md) for precise full/focused verification and the [manual/pipeline guide](hosting.md) for all owner steps. The owner explicitly requested that account creation/login, provider settings, publishing and live verification remain manual tasks for later. Do not access those accounts or deploy on the owner's behalf without a new request. Git staging/commit/push remain unperformed. Physical-phone acceptance moves to M5; recommendations and saved-program performance redesign are deferred. Actual hosted URL, Linux CI execution, Supabase persistence and first automatic deployment remain pending.
