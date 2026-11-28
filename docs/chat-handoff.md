# Project handoff

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

Updated November 28, 2026. Read [Current project status](current-status.md) for release evidence and [Backlog](backlog.md) for remaining work.

Latest operations setup: R1–R6 are complete and independently audited where
possible. Corrected secrets are present; all repository variables and main-only
environment restrictions match. Protect main is active with checks required,
deletion/force-push blocked and no bypass. GitHub automation is false. A read-only
Render service check reconfirmed native autoDeploy=no/autoDeployTrigger=off,
branch main and the health path still empty. Do not change Render yet.
Implementation fa6a183 plus CI fixes afa7029, 55297b5 and 2761b44 are pushed in
PR #2 on codex/automatic-backups. Full PR CI run 46073741651 succeeded for exact
head 2761b441a431e2dcd2d4d9df2145414a85d74d5e, including all browser profiles,
real Linux backup/restore rehearsal, production PDF checks and final checks.
The owner merged PR #2 on November 28 as 2d996e63711463bfdeb9b6750951b7b9fb73ad94.
R7 is complete: every main-push CI job passed in run 46075337655, including
Linux operations, production PDF persistence and all browser profiles/aggregate.
Production workflow run 46076366213 then completed select and skipped
operate/restore/retention because automation was false. Current stage is R10,
remaining hosted permission acceptance. The owner confirmed all edits/uploads/direct DB
changes paused on November 28 and authorized proceeding. First bootstrap was
dispatched exactly once as run 46081557423, live SHA 91a8c56, workflow head 2d996e6.
The run failed before completing pg_dump with a missing sequence SELECT grant,
reproduced read-only locally without printing any SQL/private data. No snapshot
completed and no deployment occurred. The owner applied SELECT on all public
sequences plus default SELECT for future postgres-owned public sequences on
November 28. Read-only export verification succeeded as the restricted role with
all bytes discarded. The owner confirmed writes paused until morning and said no
need to ask again. Retry run 46082543392 succeeded: R8 is complete, snapshot
20261127T232809Z-50d013eec02fbc31, live SHA 91a8c56, 14 objects, 8,023,649 stored
bytes, no storage warning. R9 restore-check run 46082960563 passed for that
snapshot: 14 objects in 57.9 seconds, matching archived application's PDF permission
checks plus database/integrity checks. R1–R9 are complete. R10 positive source,
writer upload/readback and restore-reader operations are proven; negative access/
cross-bucket checks and actual pruner deletion remain unverified. The new manual
storage-access-check.yml and guarded CLI are committed locally, alongside
sequence-permission fixes. Source policy metadata and backup full policy scope are
verified. Owner confirmed production Data API off on November 28.
November 28 backup screenshots confirm four policies, expected operations,
RLS on and no role ownership/bypass, but expressions are truncated. The read-only
phone query scripts/ops/check-backup-storage-permissions.sql returns two booleans
for exact scope and RLS/role safety; do not mark scope verified from cropped text.
Owner reported initial scope_ok=false. The original browser SQL in ignored
.local/operations/backup-bucket-permissions.sql uses (SELECT auth.uid()), while
the initial checker expected direct auth.uid(). Reproduced with real local
PostgreSQL; SQL/Python comparisons corrected to accept only those two reviewed
forms, preserving full bucket/UUID checks. Installed template passes; broader
predicate fails. All 93 focused regressions pass after the fix; no provider policy
changes. The owner subsequently reported corrected scope_ok=true on November 28:
backup scope review is complete. The owner then confirmed production Data API off.
Do not repeat those completed checks; continue to hosted permission acceptance
after publication with consent.
The readonly catalog found anon/authenticated write grants on 32 public tables
without RLS: production Data API is now owner-confirmed off; do not claim exposure
from grants alone. The hosted checker needs protected-main
publication with consent before it can use the existing environment secrets.
Only known public markers in the fixed backup project's _permissions-checks/
run-attempt prefix may be mutated; source and real backups remain read-only.
Never restore
to production. No repeated quiet-window questions during
the confirmed overnight window.
database-roles.sql, setup helper checks and regression tests now cover sequence
reads; the Linux rehearsal now uses a provisioned restricted backup role. These
new corrections are in the local R10 commit; they have not been pushed. Eighteen helper tests
passed; Linux rehearsal for these changes remains pending. Final local backend
suite: 596 passed, one intentional Linux/container skip (48.98 seconds); 89 focused
regressions passed, Ruff lint/format and walkthrough links passed. The phone query
passed against real disposable local PostgreSQL and rejected an extra policy and
disabled RLS. That database was removed and local PostgreSQL stopped. Do not retry
an ambiguous dispatch. Deployment and
automation remain off. The owner prefers manual browser
instructions, not opened tabs. Local main now matches
origin/main at 2d996e6; the R10 code/test/documentation commit is on
codex/r10-storage-permission-checks, authorized by the owner on November 28.
Push, merge and deployment still require consent. No deployment
or activation occurred. Latest checklist progress after the code
commits is local documentation work; do not discard it when switching branches.
Render's live SHA was independently reconfirmed November 28 as
91a8c566094383eb21a2e69ad2878dcf75601c54 (dep-dbsq436i0phs73dr05fg); native
auto-deploy is off. Use that live SHA for the first bootstrap-backup, branch main,
then restore-check the resulting snapshot. The first hosted backup completed and
its isolated restore rehearsal passed as recorded above.

## Repository and release

- Workspace is `C:\Users\t.lattouf\Projects\Choralation`. Keep tooling, temporary files, backups, uploads, and logs inside the project. No global configuration or firewall changes are authorized.
- `main` matches `origin/main` at `2d996e6` after the operations implementation. Hosted remains `91a8c56` at [Choralation](https://choralation.onrender.com); do not confuse pushed code with a deployed release.
- Render service is `srv-db78nlbbc2fs73e83qi0` in the owner-confirmed Toufic’s workspace, `tea-cvbfi652ng1s73ed31g0`. Deploy `dep-dbsq436i0phs73dr05fg` is live. Auto-deploy is off, and the live HTTP health-check path is empty. The Blueprint’s proposed settings are distinct from the deployed service settings.
- [GitHub run 44897674480](https://github.com/tofi-75/Choralation/actions/runs/44897674480) passed on `2f8c410`, including all four browser profiles and Linux production/PDF checks. The merged operations implementation passed all main CI jobs in run 46075337655. Local R10/sequence changes still need a new exact-SHA CI run.
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

Phone PDFs default to width in both orientations and preserve zoom. Saved rows open complete Focus at selection ID; 500ms hold/rightclick/Shift+F10 offers Go to hymn with Back to Mass. Creation from a Mass prefills its active placement. PDF storage supports identity/gzip with bounded decoding and exact size/hash. `PDF_COMPRESSED_WRITES=false` is the rollout default. `compress_pdfs` previews by default and applies per-file compare-and-swap conversion only when enabled. Feature/review repairs were committed in `a24a6ef`; system-test/account-cache fixes in `2f8c410`. They are pushed and CI-green. Hosted deployment awaits current DB/PDF backups; no hosted conversion is authorized.

Local verification: 452 backend / 127 frontend unit tests and 21 affected desktop/phone-width browser cases pass, along with build/types/lint/format/schema/docs. Local database and media were backed up before both additive migrations; preservation checks passed. Compressed writes remain off by default, existing local/hosted attachments are unchanged outside isolated tests. Physical devices and Linux S3/container CI remain release checks.

## Next work

The [system-test optimization](system-test-optimization-plan.md) is implemented and CI-green:
461 backend / 135 frontend tests, preserved 203 reader assertions, all four isolated
browser profiles in both account modes, 159 passes/21 documented skips, zero retries
or flaky results. Earlier counts above record their original sessions.

The user approved implementation of the [automatic backup/deployment plan](automatic-operations.md).
The operations implementation merged to main on November 28 adds a persistent read-only barrier, encrypted paired
snapshots in a separate Supabase project, exact-SHA release gating, weekly isolated
restores and Admin status. Choices: daily 03:17 Asia/Beirut plus predeploy; retain
7 daily/5 predeploy; pause editing through backup/build/verification; automatic
release after all CI succeeds; GitHub failure emails; attended bootstrap first.
Both enable flags default off and Render native auto-deploy must stay off. API
readiness and the Admin operations status are documented in the runbook.

On November 22 the owner replaced the initial Singapore backup project with
`Choralation Backup`, reference `rkusfrltpycgkeodtxca`, in Frankfurt (`eu-central-1`),
Nano compute. The region was verified while provisioning. Use this reference and
region for GitHub; `nfzgcrtkfbtejzisuogq` is superseded. Data API was off on that
earlier project; verify the replacement setting separately. The owner created
`choralation-backups`; Public bucket off (toggle=0), 50 MB effective limit and any
MIME type were verified. No backup files exist yet. The owner created all
three writer/reader/pruner service users; their IDs were verified. A project-specific
policy script is in ignored `.local/operations/backup-bucket-permissions.sql` and
was executed by the owner; all four bucket/object policies were verified in the SQL results.
It passed a disposable local permission test; the test database and role were
removed and the task-started PostgreSQL instance stopped. The owner created all
three GitHub environments and reports Branch `main` restrictions. Backup reference,
region and `PRODUCTION_AUTOMATION_ENABLED=false` repository variables were entered.
The six writer/reader/pruner email/password secrets were reported saved in their
respective environments; provider authentication is untested. On November 27 the
owner reported `BACKUP_PUBLISHABLE_KEY` saved in all three GitHub environments.
Next is Step 2's production project reference/publishable key, then source reader
and policies; retain the pending backup Data API verification. After the owner supplied the legacy-key retirement notice,
they authorized migration to new API keys. The local backup client now uses
Storage REST with `SOURCE_PUBLISHABLE_KEY` / `BACKUP_PUBLISHABLE_KEY` and automation
user JWTs; secret/service-role and legacy JWT API keys are rejected. Flat cursor
listing, raw gzip bytes, metadata, create-only uploads and verified deletions
preserve the snapshot contract. Existing users/policies are retained; region
variables are no longer needed for the backup client. Resume Step 2 of the
[manual setup walkthrough](automatic-operations-walkthrough.md). The agent has
not changed hosted keys/configuration/data for this transport update; key entry
above was performed manually by the owner.
Verification: 511 backend tests passed with one intentional Linux/container skip;
24 REST contract cases cover real localhost HTTP, keys/JWT renewal, raw gzip,
pagination, metadata, permissions, immutable uploads, verified deletion, integrity
and redirect protection. A real age-encrypted local PostgreSQL/PDF round trip via
the REST client and disposable DB restore passed; table counts and bytes matched.
Lint/format and 16-secret/8-variable/55-local-link walkthrough checks passed.
Updated Linux container rehearsal and actual Supabase/RLS acceptance are pending.
November 27 continuation: the owner supplied source Auth UID
`bd179bb0-6208-4907-addb-dfd0b4eefb95`. Their screenshots confirmed its email
`tofi.lattouf+source-backup-reader@gmail.com` with confirmed=true, private
`sheet-music` (public=false), and no existing Storage policies. The agent supplied
the two scoped SELECT policy statements and the verification query. The owner's
next screenshot confirmed exactly those two SELECT policies were installed on
objects/buckets. The owner then explicitly confirmed `SOURCE_PROJECT_REF` and
the three `SOURCE_PUBLISHABLE_KEY`/`SOURCE_BACKUP_EMAIL`/`SOURCE_BACKUP_PASSWORD`
GitHub entries. Actual API login/access remains untested.
The agent generated the age identity once in ignored
`.local/operations/backup-age-identity.txt`; a local encryption/decryption check
passed. Never print its private contents or overwrite/regenerate it. Public
recipient: `age1x28785mcf4w3wdu8035xascch3h9jyz5p9snedzygr3wg7mwn94s9v96sz`.
The owner subsequently confirmed the private identity saved in their password
manager and a second secure off-PC/GitHub recovery copy (R2 complete, November 27).
The owner also confirmed repository variable `BACKUP_AGE_RECIPIENT` and private
secret `BACKUP_AGE_IDENTITY` in backup-restore and backup-retention saved
(R3 complete, November 27). No private identity was printed in tool output or chat.
The owner advanced to database setup and supplied Session-pooler host
`aws-1-eu-central-1.pooler.supabase.com`, port 5432, database `postgres`, owner
username `postgres.lhwtctrekcllnpselhsb` (production ref `lhwtctrekcllnpselhsb`).
The owner connected using the Step 4 command and supplied output confirming
current database/user `postgres` and owner `postgres` for public.hymns_hymn.
The owner then reported the role script and all three password prompts completed.
Next: run `scripts/setup_operations_database.py` interactively in their PowerShell
terminal (quit psql with `\q` first), using the exact Step 4 command. The helper
prompts privately for existing role passwords, performs read-only login/permission
checks, and creates correctly encoded URL files in ignored
`.local/operations/database-urls` only after every login passes. It restricts the
new directory's owner access and never prints URLs/passwords or overwrites output.
Seventeen isolated helper tests passed (fictional credentials, no hosted access).
The three private files are now present. The agent validated their exact production
host/port/project-role/database/TLS settings and ran the helper's read-only login
and access checks against production; all three passed on November 27. No URLs,
passwords or private application rows were printed and no database writes occurred.
The owner confirmed all four GitHub entries saved: BACKUP_DATABASE_URL in
production-operations and the controller OPERATIONS_DATABASE_URL in all three
environments. Keep the RENDER gate URL private until the attended Step 9 rollout.
The owner then reported the scoped Render key saved as RENDER_API_KEY in GitHub
production-operations. It has not been provided locally or tested. The owner rejected
production test-account/fixture maintenance and explicitly chose operational checks
on November 27. The release client now calls token-protected GET /health/operations/
for schema, intended DB/gate identity, maintenance state and an actual existing PDF
read before freezing and after deployment. A single DEPLOY_CHECK_TOKEN replaces
the former application test credentials/fixture IDs. It grants no app session or
business API access. Full user login, CSRF, member reads and denied edits stay in
isolated CI/browser tests; normal-user production authentication is no longer an
automatic release check. No live test choir/Mass/hymn/account is required.
Next: save the new token privately and in GitHub production-operations, retain its
value for Render configuration only in the attended Step 9 window. Workflow mode
verify supports idle operational acceptance before enabling automation. Neither
the token nor the new endpoint has been installed/verified on Render yet.
The agent generated the token once in owner-restricted, Git-ignored
`.local/operations/deployment-check/DEPLOY_CHECK_TOKEN.txt` without printing it.
The owner confirmed it saved in the production-operations GitHub secret
DEPLOY_CHECK_TOKEN and password manager on November 27; R1 is checked. R2 recovery
copies and R3 GitHub encryption settings are now confirmed too. The owner then
explicitly confirmed R4 (budget saved) and R5 (replacement backup Data API off).
R1–R5 are complete; exact budget value was not supplied in chat. The owner confirmed
failure-email settings saved too. Current step is R7, reviewing/publishing the
implementation and passing exact-SHA CI. The owner authorized commit/push for this
batch on November 27. Publish through codex branch/PR to respect main's new required
checks; deployment remains separate. GitHub API preflight confirmed the repository
automation variable is false. Skip confirmed secrets, main-only
environment restrictions and notification configuration. Branch protection was
reported complete but read-only API checks later found rulesets=[], effective main
rules=[], and GET branches/main/protection returned 404. R6's protection checkbox
is reopened; the owner was asked asynchronously to inspect Settings → Rules → Rulesets.
Actual failure-email delivery is checked at R19.
R7 publication: implementation fa6a1831154a31650aec1a4b54c8de29b7f0dbe6 is pushed
on codex/automatic-backups in PR #2. The first PR CI run 46071870018 failed its
operations job because pytest's explicit basetemp parent .cache did not exist on
a fresh runner. The workflow now creates that parent before pytest. Require a new
green exact-SHA run; no merge/deployment/activation has occurred.
The next run reached real restoration and exposed git archive resolving backend
relative to the backend working directory. Restore now anchors git archive to ROOT
explicitly, so both the Linux test and production runner use the same repository paths.
Current pushed head is 55297b50cdbbde51d670737ada13fcf0e9c4dc2f, CI run 46072429307.
Backend, frontend, production PDF and the real Linux operations rehearsal passed;
Three browser profiles passed; mobile-430 exposed a keyboard-test focus race after
notification closure (Edit reopened before Save order). The test now waits for
the expected restored Edit focus before focusing the move control and pressing Enter;
all original keyboard/reordering assertions remain. A new full CI run is required.
No merge/deploy/activation.
Later API recheck after the owner's Active confirmation verified main protected:
ruleset 28264223 Protect main is active on the default branch, requires checks from
GitHub Actions 15368, blocks deletion/non-fast-forward, and has no bypass actors.
The secret-name audit verified main-only environment restrictions and every repository
variable, including budget 858993459 and automation false. It found missing
BACKUP_PUBLISHABLE_KEY in all three environments and SOURCE_BACKUP_EMAIL in
production-operations, where SOURCE_BACKUP_MAIL is present instead. Correct these
names/entries before hosted acceptance; secret values were never read. The owner
then confirmed all four saved on November 28. Independent API audit now finds no
missing or extra secret names in any environment; variables/main-only restrictions
match. R6 is complete. Actual provider authentication/RLS acceptance still awaits
the hosted backup/rehearsal. Automation remains false; no deployment occurred.
The owner's Branch settings screenshot showed no protection rule listed and the
Add branch ruleset/Add classic branch protection rule controls. The owner then
confirmed creating the instructed active Protect main ruleset targeting default
branch main, with checks required and deletion/force-push blocked (November 27).
Retain the same token for Render during backed-up Step 9,
not an immediate environment change. November 27 verification: 548 backend tests
passed, one intentional Linux/container skip; 107 focused operational/release/PDF/
hosting cases passed. Repository-configured Ruff checks passed for all 170 Python
files. Walkthrough validation passed for 15 secrets, 5 variables and 57 local links.
The test-started local PostgreSQL service was stopped afterward. Hosted acceptance
and Linux container rehearsal remain pending. No commit/push/deploy/enable occurred.
Never ask for passwords or connection URLs in chat.
The owner asked why SQL is needed and requested clear documentation: the manual
walkthrough now explains PostgreSQL-backed Storage RLS, the equivalent dashboard
policy editor, the exact scope, expected pre/post results and one-time setup
versus automatic API operation. No new provider action was performed for this
documentation request. Do not ask for passwords or open browser tabs.
Source Storage API acceptance, GitHub protection/notification checks,
Render token installation and attended backup/restore/release
acceptance remain pending. Automation is disabled.
The owner wants manual browser instructions and asked not to open anything.
The owner requested a checklist updated after every completed step. Maintain
R1–R19 in the manual walkthrough's Remaining work tracker and the corresponding
detailed checkbox, using explicit confirmation or verification; do not infer
secret entry from silence. Show progress when a step is completed.
The owner explicitly asked to skip what was already completed together today;
do not repeat confirmed credentials, role creation, policies or key generation.
The local hosted env still contains placeholders, but verified restricted DB URLs
now exist in ignored `.local/operations/database-urls`. Supabase Storage automation
passwords/API keys and the Render API key for Actions have not been supplied locally.
Do not paste secrets in chat or deploy before fresh paired backup/restore acceptance.
Render's November 21 read-only check reconfirmed native auto-deploy off and empty
health-check path. Backup setup added Auth users and scoped Storage policies in
the replacement project; the owner subsequently confirmed its Data API disabled. No hosted backup
or application deployment has run.
Docker is not installed locally: the new full TLS S3/container rehearsal needs Linux CI.
Project-local checksum-verified age 1.3.2 and PostgreSQL tools verified a real local
encrypted dump/disposable restore with matching row counts; source data stayed unchanged.
The same disposable clone accepted the additive operations migration without
changing pre-existing application rows. The full backend regression run, final
26 operations tests, 138 frontend tests, production build, types/lint/format,
OpenAPI, official Render schema and 305 documentation links passed locally.

1. Desktop sidebar fix, details to establish when scheduled.
2. Compact hymn-library cards on phones.
3. Show Hymn not found immediately alongside Search all placements.
4. Improve search within/across languages and discuss DB/PDF storage and loading measurements.
5. Physical-phone/coordinator rehearsal, accessibility/Firefox coverage, deferred recommendations, Practice, Arabic UI, print/release polish, and parish hierarchy.

## Documentation and evidence

The November 20 documentation-only review supersedes old uncommitted/pending-release statements in dated reports. The original [specification](../mass_hymn_picker_codex_spec.md) and [imported chat archive](chat-history-2026-10-08.md) remain source records. Temporary browser fixtures use isolated databases and fictional accounts. Never expose credentials, database URLs, private PDFs, or backup archives in Git or responses.
