# Automatic backups and deployment

Implemented locally on November 21, 2026. **Hosted automation is not active.**
The backup project exists; credentials, attended bootstrap, full hosted restore
rehearsal, live health-check configuration and enable switch are still required.
Do not enable Render's native automatic deploys: they bypass the backup gate.

For the owner's browser steps, completed setup checklist and attended rollout,
follow the [manual setup walkthrough](automatic-operations-walkthrough.md).
The owner reports `BACKUP_PUBLISHABLE_KEY` saved in all three environments on
November 27; Storage authentication remains untested. Source policies, GitHub
source settings, production database role logins and the four GitHub DB URL
entries are now confirmed. The owner reports the Render API key saved in GitHub;
API access is untested. The owner confirmed the operational-check token saved in
GitHub production-operations and the password manager on November 27 (R1 complete).
Encryption recovery copies are now owner-confirmed too (R2 complete).
GitHub encryption settings, the saved storage budget and the replacement backup
project's Data API disabled setting are now owner-confirmed (R1–R5 complete).
The owner subsequently confirmed creating the Protect main ruleset with required
checks and blocked deletion/force pushes, followed by failure-email settings.
API verification confirmed the active rule, all repository variables, budget
858993459 and main-only environment restrictions, but found BACKUP_PUBLISHABLE_KEY
missing in all three environments and SOURCE_BACKUP_EMAIL misspelled
SOURCE_BACKUP_MAIL in production-operations. R6 remains open for those entries.
Current step is R7, reviewing/publishing and exact-SHA CI;
the owner authorized commit/push on November 27. Publication proceeds through a
codex branch and PR; deployment remains separate. Email delivery is verified during activation. The exact chosen
budget value was not supplied in chat; retain the saved GitHub value.
On November 22 the backup client
was migrated from legacy-key S3 session authentication to Storage REST with
publishable keys and short-lived automation-user JWTs. The client rejects legacy
JWT API keys and elevated secret keys. Existing Auth users, RLS policies, encrypted
snapshot format and the running app's separate S3 configuration remain applicable.
Hosted backup/restore acceptance is still required before activation. See
[Supabase key migration](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

For the purpose of the SQL Editor, the equivalent Storage policy interface,
browser-ready source SQL and expected results, see
[source access explained](automatic-operations-walkthrough.md#why-use-the-sql-editor-for-file-permissions).

## Daily behavior

The `Production operations` workflow runs daily at **03:17 Asia/Beirut**, checks
freshness hourly at minute 43, and restores a backup into disposable infrastructure
on Sundays at **04:47 Asia/Beirut**. Schedules use the IANA timezone, including DST.
An overdue hourly check attempts a catch-up backup. A current-backup check reports
unresolved maintenance and missing, failed or overdue restore rehearsals.

After every successful `Application checks` push run on `main`, the release job
revalidates all required jobs and the exact SHA. PR/fork runs, failures, skipped
jobs and superseded commits cannot deploy. Already-live commits are skipped.

Backups, deployments, restore tests and retention queue without canceling an
active operation. A PostgreSQL session advisory lock also prevents overlapping
operators. GitHub schedules are best effort: the recovery target is 24 hours,
not a hard maximum during GitHub/provider outages. Enable GitHub Actions failure
emails for this repository; scheduled workflows may need re-enabling after
repository inactivity. See [GitHub scheduling](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows).

## What is backed up

- A custom-format PostgreSQL dump of the **public application schema**, including
  accounts/password hashes, memberships, private submissions, drafts, history,
  classifications and Django migration records. No passwords are passed in CLI
  arguments; PostgreSQL tools receive process-scoped environment settings.
- Every source PDF-bucket object, including private/pending and gzip objects.
  Original keys, stored bytes, MIME type, encoding and user metadata are preserved.
- An encrypted manifest with table counts, referenced PDF keys, payload hashes,
  PostgreSQL major version and the **currently deployed** application SHA. A
  predeployment dump belongs to the old schema, so its restore code is the old
  deployed commit, not the release target.

Provider Auth/configuration, provider-managed schemas, source code, email secrets,
Django's secret key and external PDF websites are not exported. Keep provider
configuration and the stable Django secret in the owner's password manager.
Losing the Django secret invalidates existing sessions; it does not destroy
Django password hashes. Supabase's built-in database backups exclude Storage
files: [official backup documentation](https://supabase.com/docs/guides/platform/backups).

Payloads and manifests are encrypted with `age` before upload. Files are addressed
by SHA-256 and reused without overwrite; payloads are split into 32 MiB plaintext
chunks before encryption to fit the bucket's upload limits. Each uploaded or
reused chunk is read back and checked. Completion is recorded last. A missing
referenced PDF or checksum mismatch blocks the release.

The private bucket retains **7 successful daily snapshots and the latest 5
completed predeployment snapshots**. Active/unresolved releases cannot be pruned.
Retention verifies retained manifests before deleting expired snapshots, then
removes unreferenced payloads older than 48 hours. Partial manifests are cleaned
after the same grace period. Source deletions do not directly delete backup copies.
This is application-managed retention; Supabase has no S3 Object Lock/versioning:
[S3 compatibility](https://supabase.com/docs/guides/storage/s3/compatibility).

The default budget is 858,993,459 bytes (approximately 0.8 GiB). Measure the actual
source size and retained versions, choose a suitable project plan, and set
`BACKUP_BUDGET_BYTES` explicitly. The Admin result warns at 80% of the configured
budget; uploads stop at the budget instead of reducing retention or purchasing
capacity. Provider quotas may reject an upload earlier. This bucket shares the
Supabase failure domain; a separate provider/offline copy would add protection
against a Supabase-wide incident.

## One-time provider setup

Supabase file permissions are PostgreSQL Row Level Security policies on Storage
metadata tables. We apply reviewed SQL as the project owner to install precise
UUID/bucket-scoped rules. **Storage → Policies** creates the same underlying
rules through the dashboard; it is an alternative to SQL, not an additional step.
For each rule use one creation method, then verify its operation and conditions.
The object SELECT rule allows file reads/listing; the bucket SELECT rule grants
only that bucket's metadata access. Neither creates upload/update/delete rights.

This is one-time permission provisioning. The scheduled jobs subsequently sign in
as their restricted automation identities and use Storage REST; they do not open
the SQL Editor, recreate policies, or require a dashboard administrator session.
PostgreSQL backup/controller/gate roles are a separate setup step for database
access and maintenance state, not a replacement for the file policies. Disabling
the unused database Data API does not disable the Storage API used by the jobs.

1. Create a **separate** Supabase project, preferably in production's region, and
   a private `choralation-backups` bucket. Keep it dedicated to these backups.
   Permit binary encrypted uploads larger than 32 MiB, for example a 50 MiB limit.
   Do not automatically upgrade billing or make either bucket public.
2. Create confirmed operational Supabase Auth users: one source reader, and a
   backup writer, restore reader and pruner in the destination project. These are
   infrastructure identities, not Choralation application accounts or roles.
3. Review existing Storage policies: permissive policies combine with OR, so a
   broad existing policy can undermine a restricted new policy. Apply the reviewed
   [source read policy](../scripts/ops/source-storage-policies.sql) and
   [backup policies](../scripts/ops/backup-storage-policies.sql) with the actual
   Auth UUIDs through `psql`. Verify source read-only, writer read/insert-only,
   reader SELECT-only, and pruner read/delete-only access. Backup jobs use
   `SOURCE_PUBLISHABLE_KEY` / `BACKUP_PUBLISHABLE_KEY` in the API-key header and
   the dedicated user's short-lived JWT in Authorization for Storage REST.
   No project secret, service-role key or generated full-access S3 key is used.
   See [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)
   and [Storage access control](https://supabase.com/docs/guides/storage/security/access-control).
   The client renews expiring sessions, exhausts flat list-v2 cursors, preserves
   raw gzip bytes and user metadata, and uploads with `x-upsert=false`. Read-only
   requests retry bounded transient errors; ambiguous writes fail without blind
   resubmission. Retention verifies deletion instead of trusting an RLS-filtered
   empty success response. Redirects never receive authentication headers.
4. As the application table owner, review/apply
   [database roles](../scripts/ops/database-roles.sql). Use hidden `\password`
   prompts. The backup reader gets public-table SELECT and future-table default
   privileges for the actual migration owner. The controller gets SELECT/UPDATE
   only on the operations table after migration; the app's lock reader gets
   SELECT only on that table. None needs production object deletion permission.
5. Use Session-pooler/direct connection strings with TLS. **Do not use transaction
   pooler port 6543.** The app can keep its existing business connection; the
   dedicated guard connection must support session locks. All three database
   identities must address the same database; a UUID in the operations table
   detects accidental cross-database configuration.
   The optional owner helper [setup_operations_database.py](../scripts/setup_operations_database.py)
   tests the three Session-pooler role logins through hidden password prompts and
   writes encoded URLs into new, ignored owner-restricted local files. It performs
   no database writes and never prints credentials. The walkthrough maps each
   file to its GitHub secret or later Render gate setting. Its 17 isolated tests
   pass. On November 27 the three generated files' production targets and actual
   role logins/expected access were verified with read-only queries. The owner
   confirmed all four GitHub URL secret entries saved; operations-table grants
   still wait for the attended migration step.
6. Generate an `age` identity with `age-keygen` into a private file. Keep its secret
   identity offline in the password manager and in the restricted restore and
   retention environments. Put only the public recipient in the writer environment.
   Never print the identity in logs or commit it. During rotation, retain old secret
   identities until every retained chunk encrypted to them has expired; the
   identity secret may contain multiple age keys on separate lines.

### GitHub environments and secrets

Restrict all three environments to trusted `main` deployments. No production
secrets belong in PR CI, frontend variables, artifacts or the source repository.
No manual approval is required for routine enabled releases. Protect `main` with
the existing required `checks` result, disallow force pushes, and review workflow
changes like application changes.

| Environment | Secrets |
| --- | --- |
| `production-operations` | `BACKUP_DATABASE_URL` (reader), `OPERATIONS_DATABASE_URL` (controller), `SOURCE_PUBLISHABLE_KEY`, `SOURCE_BACKUP_EMAIL`, `SOURCE_BACKUP_PASSWORD`, `BACKUP_PUBLISHABLE_KEY`, `BACKUP_WRITER_EMAIL`, `BACKUP_WRITER_PASSWORD`, `RENDER_API_KEY`, `DEPLOY_CHECK_TOKEN` |
| `backup-restore` | `OPERATIONS_DATABASE_URL` (controller), `BACKUP_PUBLISHABLE_KEY`, `BACKUP_READER_EMAIL`, `BACKUP_READER_PASSWORD`, `BACKUP_AGE_IDENTITY` |
| `backup-retention` | `OPERATIONS_DATABASE_URL` (controller), `BACKUP_PUBLISHABLE_KEY`, `BACKUP_PRUNER_EMAIL`, `BACKUP_PRUNER_PASSWORD`, `BACKUP_AGE_IDENTITY` |

Repository variables: `SOURCE_PROJECT_REF`, `BACKUP_PROJECT_REF`,
`BACKUP_AGE_RECIPIENT`, `BACKUP_BUDGET_BYTES`. Leave `PRODUCTION_AUTOMATION_ENABLED` unset or
`false` until acceptance. Production verification uses a protected operational endpoint
and an existing uploaded PDF; there are no production test-account credentials
or fixture IDs. Keep DEPLOY_CHECK_TOKEN only in production-operations and the
Render runtime, not the restore/retention environments.
Region variables are not used by the backup REST client; previously entered
`BACKUP_REGION` can remain unused. Preserve the running app's own S3 region.

The workflow targets the existing Choralation service
`srv-db78nlbbc2fs73e83qi0` in owner-confirmed workspace
`tea-cvbfi652ng1s73ed31g0`. Its Render API credential needs service/deploy access
there. GitHub supplies its own read-only workflow token for CI verification.
The Render connector's interactive login does not supply a GitHub Actions API key.

Render receives `OPERATIONS_DATABASE_URL` for **choralation_gate**, not the
controller password. Set `PRODUCTION_OPERATIONS_ENABLED=true` only after the
operations migration and role grants are installed. Keep `PDF_COMPRESSED_WRITES=false`.

## Attended bootstrap

The first live version lacks the write barrier, so coordinate a quiet window:
no application edits/uploads, provider-dashboard changes or manual content commands.

1. Review/push the implementation when authorized, wait for the new `checks`
   result including the dedicated `operations` job, and keep automation disabled.
2. Dispatch `Production operations` with mode `bootstrap-backup` and `sha` set to
   the **currently deployed** full commit, not the implementation commit. This
   command works before the operations migration exists. Its database dump and
   reference inventory share an exported PostgreSQL snapshot. Disappearing PDFs
   abort the attempt rather than silently producing a partial backup.
3. Record the completed snapshot ID. Dispatch `restore-check` with that snapshot
   while automation is disabled; it selects attended mode. It requires a real
   matching commit in trusted `main` history and verifies DB plus PDFs in Linux CI.
4. Only after that rehearsal passes, manually deploy the reviewed safeguard
   release during the coordinated no-edit window. Startup installs the additive
   operations migration. Keep provider startup migrations enabled.
5. Apply the operations-table role grants. Take another `bootstrap-backup` using
   the newly live SHA and rehearse its restore, protecting the migrated schema
   before configuration changes. Configure the app's session guard URL, enable
   its write protection, and configure live `/health/ready/` in Render.
   Any Render configuration change that restarts/deploys still requires the fresh
   backup and coordinated window. Do not blindly synchronize a Blueprint.
6. Verify the new readiness SHA, roles, private PDFs and ordinary editing. Run a
   fresh backup and attended restore test against this version; the latter records
   its successful result in the operations table. Record the measured pause time.
7. Set repository variable `PRODUCTION_AUTOMATION_ENABLED=true`. Run one attended
   automatic release to a reviewed, CI-green newer commit. Verify its snapshot,
   exact SHA, startup, operational checks and editing recovery. Do not claim activation
   until this succeeds.

The workflow's `backup` mode requires the enable switch; before enabling it,
use `bootstrap-backup` for the fresh attended export. Once enabled, releases also
require a recorded successful restore rehearsal within the last eight days.

## Read-only and release behavior

The app persists read-only state before draining active mutations. Every unsafe
HTTP route, including Django Admin, is guarded except login/logout. Reads, PDFs,
CSRF bootstrap and sign-in/out remain available. Auth security/session bookkeeping
may still write; exported PostgreSQL snapshots keep those records consistent.
Domain-management commands inherit the same guard. Startup migration/role/default
provisioning is the controlled exception; startup never creates user accounts.
Django's own commands and direct SQL/S3 dashboard operations are trusted operator
paths: do not run content mutations outside this coordinator during a window.

The guard holds a shared session lock through the request and its commit callbacks.
The controller waits for the exclusive lock (60-second drain limit), then relies
on durable read-only state through snapshot/build/startup/verification. No TTL
automatically reopens editing after a crash or ambiguous deploy response.

Blocked writes return HTTP 503, `Retry-After: 30`, and
`code: maintenance_read_only`. A global banner and disabled editors preserve
working-copy values. Existing revision/conflict checks apply on explicit retry;
the browser does not reload or sign out users. Transport blocks repeated content
writes while paused. Unauthenticated account forms can retry after maintenance.

`GET /api/v1/operations/status/` is authenticated. Ordinary users see only the
maintenance state/reason/start time. Admins also see phase, recovery reference,
last backup/age, last release and restore test in **Settings → Backups & deployments**.
It cannot start operations or unlock maintenance. Readiness returns the source SHA
and whether write protection is enabled; enabled readiness also checks the state row.

Owner decision, November 27: replace the dedicated production test account with
**GET /health/operations/**, authenticated by a separate strong DEPLOY_CHECK_TOKEN.
It checks consistent/applied migrations, application queries, intended database
identity, gate session/advisory lock, and an existing active uploaded PDF with
bounded size/gzip/checksum validation. It performs no content writes and returns
only status, running SHA and maintenance flags. The worker sends the controller's
database UUID in a header, preventing a different database from passing the
preflight. Invalid tokens get 403 before dependency checks; failures return generic
503 and no private/provider details. All responses are no-store. The token grants
no application session or business API access. The public readiness endpoint stays
lightweight and remains Render's health-check target.

The worker checks this endpoint before freezing and after deployment, requiring
the expected SHA and read-only state. Manual workflow mode **verify** can check an
idle configured deployment before automation is enabled. Production user login,
CSRF/session behavior and member permissions remain covered by isolated CI/browser
tests and initial attended acceptance; they are no longer exercised automatically
against production after every release. No permanent production test records are
needed. At least one existing valid uploaded PDF is required for the storage check.

The release sequence is: validate exact CI/source and credentials → freeze/drain →
verified paired snapshot → recheck `main` → persist deploy intent → request exact
Render commit → monitor the returned deployment ID → verify readiness/SHA and
protected database/schema/gate/PDF checks → reopen editing. Free-service cold starts get
bounded readiness retries. POST deployment requests are never blindly retried.
No backup step changes PDF compression or converts existing files.

## Failure recovery and restoration

Use workflow-dispatch `status` to get the sanitized operation reference. A backup
failure before deployment reopens editing. A Render build failure reopens it only
after the previous source SHA is confirmed healthy. Unknown requests, startup,
migration and verification failures keep editing paused and fail the workflow.

For recovery, inspect the specific Render deploy, logs, currently serving SHA and
migration state. Confirm no active deployment remains. If startup/migrations may
have run, explicitly review schema compatibility before dispatching `recover` with
the exact operation ID and `schema_reviewed=true`. The command refuses another
operation's lock and never restores a database automatically. A stale flag is not
permission to force-unlock an unknown migration.

For data recovery, **obtain separate authorization and keep the app read-only**.
Select a completed snapshot; decrypt its manifest with the retained age identities.
For an owner-run inventory, configure the backup reader/identity privately and run
`python scripts/production-ops.py restore-export --snapshot SNAPSHOT_ID`. Add
`--output-dir .local/backups/restore-SNAPSHOT_ID` to explicitly export plaintext.
The directory must be new and inside project-local backups; original object keys
are mapped to numbered local files to prevent path traversal. Only use an export
with `RESTORE_COMPLETE.json`; failed exports can leave incomplete private files.
`manifest.json` contains the original-key/metadata mapping. This command never
modifies a remote database or bucket. Validate the archive with `pg_restore
--list`, then rehearse restoration in a separate target first. Restore the public
schema with `pg_restore --exit-on-error --no-owner --no-acl`; restore each object's
original key, content type, encoding and metadata from the same manifest. Recheck
all table counts, foreign keys and PDF hashes before pointing a compatible app at
that target. Preserve current production separately before replacing anything.
Keep provider schemas intact; do not reset a Supabase project or overwrite its
provider-managed Auth/Storage schemas. Clear restored operations state only after
explicit schema/app verification. Code rollback does not undo migrations.

The automated rehearsal uses `--clean --if-exists` **only against its fresh disposable
database**, because a public-schema dump includes `CREATE SCHEMA public` and the
default empty database already contains it. Do not copy those destructive flags
onto an existing hosted database without a reviewed restoration procedure.

Weekly rehearsal automates those checks in fresh run-owned PostgreSQL and a TLS
S3 emulator, binds them only to localhost, loads the snapshot's trusted historical
application code, disables real mail, checks authenticated/anonymous PDF access,
and removes containers/volumes/private temporary files. It has no production-target
option. Logs/results contain sanitized summaries, never database or PDF artifacts.
The probe installs that historical commit's dependency lock in its own temporary
environment. A future Python-major upgrade also requires checking the retained
commits' wheel compatibility; a failed rehearsal blocks releases rather than
silently substituting newer packages.

## Verification and remaining activation work

`backend/tests/test_production_operations.py` covers corruption, missing files,
chunking/deduplication, retention, protected reads/auth, blocked writes/commands,
status redaction, concurrent drain and the deployment failure boundary.
`backend/tests/test_operations_integration.py` runs real age, PostgreSQL export,
restoration and private TLS S3/application acceptance in its dedicated Linux job;
source/destination transfers exercise the publishable-key client through a local
HTTP contract fixture. `backend/tests/test_supabase_storage.py` covers new-key
validation, session renewal, binary gzip/Unicode keys, cursor pagination, scoped
access, upload/deletion integrity, retries, redaction and redirect rejection.
Fixtures do not establish hosted Supabase authentication or effective RLS rights.
Frontend tests cover preserved editor values, explicit resume, no session expiry,
write suppression and Admin diagnostics. Existing browser profiles remain unchanged.

Local checks do not establish hosted credentials, provider RLS, Linux containers,
failure-email delivery or physical-phone acceptance. Record those results during
bootstrap before enabling production automation. No hosted backups or releases
were created as part of the local implementation.

November 21 local evidence: the full backend regression run passed, and the final
26 backup/integrity/recovery cases passed after the remaining infrastructure
repairs. All 138 frontend tests, type/lint/format checks, production build, OpenAPI
validation and documentation links passed. A real encrypted export was restored
into a disposable local database; the additive migration preserved all pre-existing
application rows checked, including account hashes, memberships, Masses and PDF
references. Only expected Django migration/content-type/permission metadata was
excluded from the unchanged-row comparison. The source database was not modified.
November 22 provider progress: the owner replaced the initial Singapore backup
project with `Choralation Backup`, reference `rkusfrltpycgkeodtxca`, in Frankfurt
(`eu-central-1`) on Nano compute. Frankfurt was verified in the dashboard while
the project was provisioning. Use GitHub `BACKUP_PROJECT_REF=rkusfrltpycgkeodtxca`;
the earlier Singapore reference is superseded. The already-entered region variable
is no longer consumed by the REST client.
Data API was disabled on the earlier project; verify it is also off on this replacement.
The owner created `choralation-backups`; the agent verified Public bucket off,
the effective 50 MB file limit and unrestricted MIME types. The bucket is empty
and has no backup files yet. The three writer/reader/pruner Auth users were
created and their IDs verified. The owner ran the project-specific policy query;
all four bucket/object policies were verified in the SQL results. It passed a disposable local PostgreSQL test
of per-user read/upload/delete rights and denial of access to another bucket.
The generated query is kept in ignored `.local/operations/backup-bucket-permissions.sql`.
The owner created GitHub environments `production-operations`, `backup-restore`
and `backup-retention`, and reports a Branch `main` restriction on all three.
Repository variables for the backup reference, region and disabled automation
switch were entered. All six writer/reader/pruner email/password secrets were
reported saved in their corresponding environments; provider authentication has
not been tested. On November 27 the owner reported `BACKUP_PUBLISHABLE_KEY` saved
in all three environments. Source credentials and the backup Data API verification
remain outstanding.
November 27 source screenshots confirmed Auth user
`bd179bb0-6208-4907-addb-dfd0b4eefb95` is the confirmed
`tofi.lattouf+source-backup-reader@gmail.com` account, `sheet-music` is private,
and no existing policies were returned for Storage objects/buckets. The two
source SELECT policies were applied by the owner; their screenshot verified
`choralation_backup_source_objects_read` on objects and
`choralation_backup_source_bucket_read` on buckets, both SELECT. API login/access
tests remain pending. The owner subsequently confirmed `SOURCE_PROJECT_REF` and
all three source secrets saved in GitHub. The agent generated the backup age
identity once in ignored `.local/operations/backup-age-identity.txt` and verified
encryption/decryption locally. The owner subsequently confirmed both private
recovery copies and the GitHub encryption entries (R2/R3 complete).
The public recipient is recorded in the walkthrough.
The restricted database roles and all four GitHub database URL entries were
subsequently verified/saved, as recorded in the walkthrough. Source API access,
GitHub protection/notification checks, later Render deployment-check token installation and
attended activation remain pending. Follow the
[manual walkthrough](automatic-operations-walkthrough.md) in order.

November 22 publishable-key verification: 511 backend tests passed, with one
intentional Linux/container-only skip. The 24 Storage REST contract cases include
real localhost HTTP transfers and redirect rejection. A real local PostgreSQL
export was age-encrypted, transferred through that client, decrypted and restored
into a disposable database with matching table counts; raw/gzip fixture PDFs and
metadata also matched, and deduplication/retained-snapshot checks passed. Lint,
formatting and walkthrough secret/variable/link checks passed. The HTTP fixture
is not a hosted Supabase server: real project key acceptance and effective RLS,
plus the updated Linux full rehearsal, remain release gates. No hosted data,
provider settings, commits, pushes or deployments were changed by this migration.
Docker is not installed locally; the dedicated Linux acceptance job remains a release gate.

November 27 operational-check verification: 548 backend tests passed, with one
intentional Linux/container-only skip. The focused operational/release/PDF/hosting
run passed 107 tests. Coverage includes token rejection before dependency access,
schema and database/gate identity checks, maintenance state, existing raw/gzip PDF
reads, safe error responses and deployment failures before/after a request. An
isolated member test exercises CSRF login, Mass/PDF reads and denied deletion.
Repository-configured Ruff lint and formatting checks passed for all 170 Python
files; walkthrough configuration/link checks also passed. The machine token was
generated once in ignored `.local/operations/deployment-check/DEPLOY_CHECK_TOKEN.txt`;
its contents were not printed. GitHub entry, later Render installation and hosted
verification are pending. Nothing was committed, pushed, deployed or enabled.
