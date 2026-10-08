# Conversation handoff — October 8, 2026

Source chat: **Plan parish choir collaboration**, thread `01a112a3-21c7-7151-96f4-e0ebfdcd1933`.
Imported into the current Choralation chat at the project owner's request. All six source turns were read; there were no further pages. The companion [message archive](chat-history-2026-10-08.md) preserves the available user and assistant messages in chronological order. This is a context handoff, not a merge of application chat history or an assertion that hidden model memory was accessible. Command logs and internal reasoning are not copied.

## Standing project instructions

- Work only inside `C:\Users\t.lattouf\Projects\Choralation`; keep tooling, logs, temporary files, uploads, and generated artifacts there.
- Do not stage or commit unless the owner specifically asks. On October 8 the owner explicitly authorized the completed M3 checkpoint and starting M4; that authorization does not include committing subsequent M4 changes.
- Keep code documented and the UI simple and intuitive. Phones are the primary device; retain desktop usability and readable Arabic/Syriac content.
- Historical requests to delegate a particular code review are recorded in the archive. They do not request a new review or new agents during this handoff.

## Current delivered state

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

