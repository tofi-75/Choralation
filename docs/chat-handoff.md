# Project handoff

Updated November 21, 2026. Read [Current project status](current-status.md) for release evidence and [Backlog](backlog.md) for remaining work.

## Repository and release

- Workspace is `C:\Users\t.lattouf\Projects\Choralation`. Keep tooling, temporary files, backups, uploads, and logs inside the project. No global configuration or firewall changes are authorized.
- `main` matches `origin/main` at `91a8c56` before this documentation review. This commit is live at [Choralation](https://choralation.onrender.com).
- Render service is `srv-db78nlbbc2fs73e83qi0` in the owner-confirmed Toufic’s workspace, `tea-cvbfi652ng1s73ed31g0`. Deploy `dep-dbsq436i0phs73dr05fg` is live. Auto-deploy is off, and the live HTTP health-check path is empty. The Blueprint’s proposed settings are distinct from the deployed service settings.
- [GitHub run 43712740786](https://github.com/tofi-75/Choralation/actions/runs/43712740786) passed. The last repair closes modal notices before subsequent choir-test assertions. The production image and PDF persistence checks passed.
- Commit, push, and deployment were authorized for the November 15 release. Obtain authorization for another release. Back up hosted PostgreSQL and PDF objects separately before deploying.

## Application facts

- Django/PostgreSQL API and React/TypeScript/Vite frontend. Sessions and CSRF use one origin. PostgreSQL is required for locking and integrity.
- Accounts begin as regular users. Simple-account registration is enabled, verification and emailed recovery disabled. Choirmaster requests live in Settings. Approval grants choir creation; independent Leader/Planner/Member assignments control each choir.
- Mass drafts autosave and always reopen in edit mode. Save Mass finalizes. Planner/Admin Edit confirms reopening a finalized Mass. Derived usage is choir-scoped and finalized-only. Shared revisions, serialized saves, and explicit stale-version review protect concurrent work.
- A hymn created from a draft returns to the originating section. Warnings require confirmation before insertion. Private member hymns require receiving-choir Leader/Planner publication before shared selection.
- Focus has compact metadata, one-line title truncation, lyric pagination and zoom, PDF edge-aware vertical page turns, and long downward exit. Nested fullscreen closes independently. Screen wake acquisition/release stays automatic.
- Focus restoration uses session storage keyed by account, Mass, and browser history entry. Reload restores Focus at the first hymn. Reading positions persist only in the mounted Focus session. Browser-native fullscreen needs another interaction after reload.
- Default seasons are the eight approved groups. Ordinary Time means any-season hymn suitability. Admin classifications and choir calendar settings are shipped.

## Working environment

The November 20 session launched local PostgreSQL on `127.0.0.1:55432`, Django on `127.0.0.1:8000`, and Vite development on `127.0.0.1:5173`. Frontend-proxied readiness passed. Check listeners before assuming those processes survived a session change.

Use `dev.cmd` to run `db-start`, `migrate`, `backend`, `frontend`, `check`, or `e2e`. Scripts use project-local runtimes and process-only execution policy. Backend runs without automatic reload. Phone preview builds optimized assets and requires a rebuild after edits.

The owner declined firewall changes after phone LAN requests timed out on this work PC. Preserve that preference. Public-profile inbound blocking was recorded as the likely boundary. The Cloudflare tunnel used in October was removed. Physical iPhone/Android acceptance is still pending.

## Current local batch

[Choir roles, Mass reading and lossless PDFs](roles-reader-pdf-update.md) is the implementation/rollout reference. Global roles now Admin/Choirmaster/User; scoped roles Leader/Planner/Member. Creators become Leader; Leaders manage their choir and delete Masses; Planners write/finalize/reopen but cannot delete. Global approval and scoped roles are independent. Revocation preserves assignments. Shared hymn editing requires Admin or Leader/Planner membership.

Phone PDFs default to width in both orientations and preserve zoom. Saved rows open complete Focus at selection ID; 500ms hold/rightclick/Shift+F10 offers Go to hymn with Back to Mass. Creation from a Mass prefills its active placement. PDF storage supports identity/gzip with bounded decoding and exact size/hash. `PDF_COMPRESSED_WRITES=false` is the rollout default. `compress_pdfs` previews by default and applies per-file compare-and-swap conversion only when enabled. Migration preserves legacy access. No commit/push/deploy or hosted conversion authorized for this batch. Keep all November 20 documentation edits.

Local verification: 452 backend / 127 frontend unit tests and 21 affected desktop/phone-width browser cases pass, along with build/types/lint/format/schema/docs. Local database and media were backed up before both additive migrations; preservation checks passed. Compressed writes remain off by default, existing local/hosted attachments are unchanged outside isolated tests. Physical devices and Linux S3/container CI remain release checks.

## Next work

The three review regressions are repaired locally. Hosted creation now defaults to User and accepts Admin/Choirmaster/User. Hymn-row pointer tracking observes document-level movement/up/cancel, keeps second-touch suppression, and clears pending holds on window blur. The targeted checks passed 31 backend and 24 frontend cases plus types/lint. [System test optimization](system-test-optimization-plan.md) is planned only: preserve all cases/modes/profiles; start with `vmThreads` (127-test benchmark 42.68s → 16.31s), then isolated per-profile CI jobs and fixture/journey improvements. No runner/CI changes or release operations were performed.

1. Desktop sidebar fix, details to establish when scheduled.
2. Compact hymn-library cards on phones.
3. Show Hymn not found immediately alongside Search all placements.
4. Improve search within/across languages and discuss DB/PDF storage and loading measurements.
5. Physical-phone/coordinator rehearsal, accessibility/Firefox coverage, deferred recommendations, Practice, Arabic UI, print/release polish, and parish hierarchy.

## Documentation and evidence

The November 20 documentation-only review supersedes old uncommitted/pending-release statements in dated reports. The original [specification](../mass_hymn_picker_codex_spec.md) and [imported chat archive](chat-history-2026-10-08.md) remain source records. Temporary browser fixtures use isolated databases and fictional accounts. Never expose credentials, database URLs, private PDFs, or backup archives in Git or responses.
