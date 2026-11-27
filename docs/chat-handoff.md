# Project handoff

Updated November 27, 2026. Read [Current project status](current-status.md) for release evidence and [Backlog](backlog.md) for remaining work.

## Repository and release

- Workspace is `C:\Users\t.lattouf\Projects\Choralation`. Keep tooling, temporary files, backups, uploads, and logs inside the project. No global configuration or firewall changes are authorized.
- `main` matches `origin/main` at `2f8c410` before the operations implementation. Hosted remains `91a8c56` at [Choralation](https://choralation.onrender.com); do not confuse pushed code with a deployed release.
- Render service is `srv-db78nlbbc2fs73e83qi0` in the owner-confirmed Toufic’s workspace, `tea-cvbfi652ng1s73ed31g0`. Deploy `dep-dbsq436i0phs73dr05fg` is live. Auto-deploy is off, and the live HTTP health-check path is empty. The Blueprint’s proposed settings are distinct from the deployed service settings.
- [GitHub run 44897674480](https://github.com/tofi-75/Choralation/actions/runs/44897674480) passed on `2f8c410`, including all four browser profiles and Linux production/PDF checks. The new operations batch still needs its own Linux CI run.
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
Current local uncommitted work adds a persistent read-only barrier, encrypted paired
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
names/entries before hosted acceptance; secret values were never read.
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
