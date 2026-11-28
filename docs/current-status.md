# Current project status

<!-- attended-release-status -->
**Attended release, November 28:** The owner authorized merging PR #3 after
checks and proceeding with deployment. All ten PR checks passed in run
46120412467; PR #3 is merged as 9f6e848ee7f2fd6b4a7674f84f86600aeb7ae860.
All ten main-push CI jobs passed in run 46121279640. Hosted permission acceptance
run 46122087347 passed writer, reader, pruner and cleanup, but its final table API
probe failed after successful source Auth/Storage/catalog checks. A follow-up
checker correction handles Supabase's documented disabled-schema response with
explicit owner confirmation; 99 focused regressions pass. A complete hosted rerun
is required before deployment. The owner confirmed a new no-edit/upload/direct
DB-change window until backup and release finish. Local main matches the merge.
Next: complete hosted R10 permission checks, a fresh paired database/PDF backup
and its isolated restore check, then the initial safeguard deployment with
operations and compressed writes disabled. GitHub automation remains false.
This status supersedes earlier local-only/publication-consent notes below.
<!-- /attended-release-status -->

Reviewed on November 20, 2026 against repository commit `91a8c56`, the running local app, and Render’s service and deployment records.

## Release and evidence

Choralation is live at [choralation.onrender.com](https://choralation.onrender.com). Render serves commit `91a8c566094383eb21a2e69ad2878dcf75601c54`, deployed November 15. [GitHub Actions run 43712740786](https://github.com/tofi-75/Choralation/actions/runs/43712740786) passed both application checks and the production image/PDF persistence job. The release included 119 passing frontend unit tests. The November 20 documentation review adds no new feature release.

Render uses the existing Free web service in Frankfurt. A November 28 read-only service check reconfirmed native automatic deployment is off, the live HTTP health-check path is empty and 91a8c56 remains live. The Blueprint keeps native deployment off so the [backup-gated workflow](automatic-operations.md) can be the sole automatic release path. Separate backup storage and GitHub settings are configured; the first hosted backup and isolated restoration passed. R10 permission acceptance, live safeguards/readiness configuration and attended activation remain pending. A previous public readiness request timed out; verify it during preflight rather than assuming current health.

Production requires private S3 storage and verifies write/read/cleanup before startup. CI verifies PDF persistence across fresh application containers. Prior hosted persistence acceptance is recorded in the dated reports. The November 20 review checked service state and public readiness without changing hosted records or downloading private PDFs. A current database backup and a separate PDF bucket backup are required before another authorized release.

## Changes awaiting deployment

The [automatic operations implementation](automatic-operations.md) adds encrypted paired
database/PDF snapshots, persistent write protection, Admin diagnostics, daily schedules,
retention, weekly isolated restore rehearsals and exact-CI-commit deployment. It is
merged to main in 2d996e6 (PR #2, November 28), defaults to disabled, and has not
deployed changes to the hosted app. Full PR and main-push CI passed (main run
46075337655), including all browser profiles, Linux backup/restore and production
PDF checks. Production workflow 46076366213 skipped its operation jobs while
automation was false. Setup R1–R8 is complete: first hosted paired snapshot
20261127T232809Z-50d013eec02fbc31 succeeded in run 46082543392, covering DB plus
14 objects (8,023,649 stored bytes). Sequence SELECT grants were corrected after
the first attempt failed; provisioning/preflight/regression updates are local.
Isolated restoration passed in 46082960563: 14 objects, database/integrity and
archived-app PDF permission checks, 57.9 seconds. R1–R9 are complete. Negative
permission checks and actual pruner deletion remain R10's next work; no app
deployment or automation activation occurred. A local manual workflow now checks
each restricted Storage identity with public disposable markers and cleanup. Source
RLS metadata and backup policy scope/role flags are verified. Production Data
API-off was owner-confirmed on November 28 after broad default public-table grants
were found. The hosted permission workflow remains pending. These checks and
sequence fixes are committed locally on codex/r10-storage-permission-checks with
owner consent on November 28; push and deployment remain pending consent.
Final November 28 local verification passes 596 backend tests with one intentional
Linux/container skip, plus lint/format and documentation link checks. Backup
screenshots verify operations and RLS/role flags; the owner subsequently confirmed
the full-scope query true. The updated container rehearsal needs CI.
The initial false phone scope result exposed a checker mismatch with the installed
`(SELECT auth.uid())` form. Corrected SQL/Python comparisons pass against the exact
browser provisioning template on local PostgreSQL and reject broader scope;
93 focused regressions pass. The owner confirmed corrected `scope_ok=true` on
November 28, completing backup policy scope review without provider policy changes.
The November 22 backup transport update replaces legacy anon-key S3 authentication
with publishable keys and automation-user JWTs over Storage REST. Existing users
and RLS policies remain usable. Setup R1–R6 is complete, including corrected secret
names verified through GitHub's API. Hosted source/writer/reader authentication
and full restoration passed; pruner and negative permission checks remain R10. See the [manual walkthrough](automatic-operations-walkthrough.md).
The owner chose operational checks on November 27: a protected read-only runtime
probe replaces production test accounts/fixture IDs. It verifies version/schema,
database/gate identity and an existing uploaded PDF. User login/member flows stay
in isolated CI and initial manual acceptance. The operational token and new
runtime endpoint still need attended configuration/verification.
The November 27 backend suite passes 548 tests with one intentional Linux/container
skip. Operational checks cover authorization, schema/gate identity, maintenance,
existing raw/gzip PDF reads and deployment failure boundaries; an isolated member
test covers CSRF login, Mass/PDF reads and denied deletion. The 24 REST contract
cases and earlier real encrypted local DB/PDF/disposable-restore round trip passed.
Linux CI now passed on main; hosted key/RLS acceptance remains required.
Local real age encryption, a PostgreSQL export/disposable restore and all recorded row
counts passed; the dedicated Linux container/S3 job now passed in main CI.
The first hosted backup and isolated restore passed on November 28 as recorded above.

The November 21 checkout implements independent Admin/Choirmaster/User accounts and Leader/Planner/Member choir assignments, phone PDF width fit, saved-row Focus/hold navigation, placement prefill and lossless PDF gzip storage. [Behavior, permissions and staged rollout](roles-reader-pdf-update.md) document the changes. They are local, with additive migrations and compressed writes disabled by default. Hosted files have not been converted. The live release below remains unchanged.

Local database/media backup and migration preservation checks passed. The feature work and three review repairs are recorded in `a24a6ef`. The separate [system-test update](system-test-optimization-plan.md) passes 461 backend tests, 135 frontend tests, seven runner-gate tests and the complete eight-run browser matrix: 159 passes, 21 documented skips, zero retries or flaky results. It preserves all 203 prior reader assertions, isolates profile/mode databases and services, reuses one checked frontend build and merges all browser reports. A three-run comparison of the same 133 cases reduced median unit runtime from 32.4 s to 15.9 s with two isolated VM workers; the current 135 cases also pass in both pools. Production-preview testing exposed and fixed an anonymous account-config cache race. The matching 2f8c410 commit passed GitHub run 44897674480, including Linux CI/S3/container checks. Physical phones and hosted deployment remain pending; the new operations batch needs a separate CI run.

## Live behavior at 91a8c56

- New accounts start as regular users. Simple-account mode enables registration and disables verification and emailed recovery. Existing password login remains available. API roles remain Admin, Planner, and Viewer.
- Settings contains Account, default choir preference, Admin classification managers, and the Admin-only Manager requests queue. Manager approval grants choir creation. Choir membership still determines planning access to each choir. Creating a choir makes its creator a Planner of that choir.
- Members can create private hymns and submit them to their choir’s planners for publication. Shared hymns and protected PDF access follow publication and membership rules.
- Draft Masses open in edit mode and autosave. Save Mass waits for saved changes and finalizes the program. Finalized programs open read-only. Planner/Admin Edit confirms reopening as a draft. Usage counts derive only from finalized selections within the selected choir.
- A missing-hymn search can lead from a draft section to hymn creation and back. The new hymn is inserted automatically when suitable, or only after warning confirmation. The current create action appears after the shared-library search confirms no match.
- Navigation shows Home, Hymns, Mass plans, Mass History, and Choirs, with Settings below. The profile menu opens Account settings or signs out. Notices and confirmations use centered dialogs. Notifications close with their backdrop, close icon, or Escape.
- Saved Mass hymn rows are clickable across their contents and hymn details provide Back to Mass. Language, key, tempo, and voices appear in the saved program. Missing key/tempo use `—`, single voice uses `1`, and unspecified polyphonic voices use `-`.
- Mass Focus uses a compact title/metadata/close header and previous/next hymn footer. All header titles share the same responsive font rule and truncate to one line with a direction-aware ellipsis. Focus entry puts keyboard focus on the dialog, leaving the title selector available by Tab.
- Short vertical swipes turn PDF pages in Focus and PDF fullscreen, or lyric pages in Focus. Oversized PDFs pan until an edge, then a fresh swipe turns the page. A long downward swipe from the top of any page closes the active reader. Lyrics reflow for viewport and font-size changes and retain their passage within the session.
- Reloading the same Mass browser-history entry restores Focus in that tab, starting at the first hymn. An explicit exit clears that restoration. This uses optional session storage. Native fullscreen requires a new interaction after reload. PDF and lyric reading positions are retained within a mounted Focus session.
- The eight default season groups are Advent & Christmas, Epiphany, Lent, Passion, Resurrection, Pentecost, Holy Cross, and Ordinary Time. Ordinary Time also marks any-season suitability. Choir calendar defaults, timezone, and exact-date overrides are available.
- The current seed command declares 39 defaults across the five classifications. Migrations can retain inactive former categories and custom rows, so an existing database can contain more records.

## Pending work

- Fix the desktop sidebar and compact hymn-library cards on phones.
- Show the missing-hymn creation action immediately alongside Search all placements.
- Improve same-language and cross-language search.
- Measure storage and hymn/PDF loading against the target below one second; lossless gzip storage is implemented locally with staged rollout pending.
- Record physical iPhone Safari and Android Chrome acceptance, coordinator rehearsal, screen-reader review, and Firefox coverage. Emulated viewports do not complete these checks.
- Recommendations, Practice, complete Arabic UI/language settings, print/release polish, larger-library performance measurement, and parish hierarchy remain future work. Choir membership and collaborative revision-guarded planning are already implemented.

## Running locally

From this checkout, run `.\dev.cmd db-start`, then run `.\dev.cmd backend` and `.\dev.cmd frontend` in separate terminals. Open [the local app](http://127.0.0.1:5173/). Django uses `127.0.0.1:8000`, PostgreSQL `127.0.0.1:55432`, and the frontend proxies requests to Django. The November 20 session started these services. Django system checks and migration checks passed. A Chrome smoke check verified the sign-in page, proxied readiness, simple-account flags, anonymous API protection, and absence of page errors. The documentation verifier passed 262 local links and source-fixture checks; section anchors and Git whitespace checks passed.

For phone access, use [Phone testing](phone-testing.md). The owner’s instruction to keep Windows firewall settings unchanged remains in effect. The work PC’s earlier phone requests timed out at the network boundary. A successful same-PC request does not establish phone connectivity.

## Documentation authority

Use this page, [README](../README.md), [API contract](api.md), [Accounts and choirs](accounts-and-choirs.md), and [Backlog](backlog.md) for current behavior. The original specification and imported chat archive preserve source material. Dated milestone and incident reports retain their original evidence and are labelled historical. Test counts and old local-service claims in those reports describe the recorded session.

[Conversation handoff](chat-handoff.md) contains the condensed context for continuing work. Commit, push, deployment, provider changes, and hosted data changes require the owner’s authorization for the next release.
