# Manual setup: automatic backups and deployment

Updated November 27, 2026. Follow these steps in order. Check a box only after
the step succeeds. You can stop after any setup step and resume later.

**Current stage: R7, review/publish the implementation and pass CI (Step 7).**
The owner confirmed the Protect main ruleset created on November 27, requiring
checks and blocking deletion/force pushes. Failure-email settings are now owner-confirmed;
actual failure-email delivery is still verified during attended activation (R19).
The owner confirmed R4 (storage budget) and R5 (replacement backup Data API off)
on November 27. R1–R6 are complete. The owner authorized commit/push on November 27;
publish through a codex branch and pull request to respect the new main protection.
Implementation commit fa6a183 is pushed on codex/automatic-backups in
[pull request #2](https://github.com/tofi-75/Choralation/pull/2). R7 remains open
until required CI succeeds and the reviewed implementation reaches main. The first
Linux operations run exposed a missing parent cache directory; its workflow now
creates that directory explicitly before pytest. Updated exact-SHA CI is required.
deployment and automation remain off. The exact chosen budget value was not supplied
in chat; retain the saved GitHub value. Do not repeat completed setup.
R1 is complete: the owner confirmed DEPLOY_CHECK_TOKEN saved in GitHub
production-operations and the password manager on November 27. Render entry and
hosted operational verification still wait until the backed-up rollout.
R2 is complete: the owner confirmed the existing encryption identity saved in
the password manager and a second secure recovery copy outside this PC/GitHub.
R3 is complete: the owner confirmed the public recipient variable and both private
identity secrets saved. Do not repeat completed setup; proceed from the next
unchecked tracker item. Saved credentials still need the later hosted acceptance checks.
The owner connected and confirmed database/current user `postgres` and application
table owner `postgres`, then reported the three roles/passwords created. All three
private URL files are now present and their production role logins/expected
access were verified with read-only queries. The owner confirmed the backup URL
and all three GitHub controller URL secrets saved, followed by the Render API key
in production-operations. The Render key has not yet been tested. Step 3's
private recovery copies and GitHub encryption entries are now owner-confirmed.
The owner supplied screenshots confirming the reader account, private bucket,
absence of pre-existing Storage policies, and both newly created source SELECT
policies, and confirmed the GitHub source project reference and three source secrets.
Actual API access remains untested. The backup encryption identity was generated
locally and passed an encryption/decryption check on November 27; its recovery
copies and GitHub encryption settings were subsequently confirmed saved. Step 1's backup
publishable-key entry and replacement project's Data API disabled setting were
confirmed complete on November 27. The legacy-key dependency
was removed from the local implementation on November 22. Backup jobs now use
Supabase Storage REST with a publishable key and each automation user's JWT;
the existing users and bucket policies can be retained. See
[Supabase's new-key guidance](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

The six writer/reader/pruner email and password secrets were entered by the owner.
`BACKUP_PUBLISHABLE_KEY` was reported saved in all three environments on November 27;
its provider authentication has not yet been tested. No hosted backup, restore rehearsal
or application deployment has run for this setup. The implementation is still local
and uncommitted. Hosted authentication/permissions still require attended acceptance.

Keep `PRODUCTION_AUTOMATION_ENABLED=false` until Step 10. Keep Render native
Auto-Deploy off permanently; GitHub will coordinate deployments after backup.
This document records instructions, not authorization to commit, push or deploy.

## Remaining work tracker

Update this tracker and the detailed checkbox below after each completed step.
Mark completion only from a successful check or explicit owner confirmation;
saved credentials alone do not prove working provider access. Keep run URLs,
snapshot IDs and deployment SHAs in the non-secret setup record at the end.
Unchecked items below remain outstanding as of November 27. Some credential/recovery
entries may already have been made but still need individual confirmation.

- [x] **R1 — Deployment-check token:** save the existing local token in the
  password manager and GitHub production-operations secret DEPLOY_CHECK_TOKEN
  (Step 5; owner confirmed both saves, November 27). Render entry waits until R13.
- [x] **R2 — Encryption recovery:** confirm the private age identity is saved
  in the password manager and a second owner-controlled copy outside this PC/GitHub
  (Step 3; owner confirmed both copies, November 27). Preserve the existing identity.
- [x] **R3 — Encryption settings:** confirm BACKUP_AGE_RECIPIENT repository
  variable and BACKUP_AGE_IDENTITY secrets in backup-restore and backup-retention
  are saved (Step 3; owner confirmation, November 27).
- [x] **R4 — Storage budget:** select and save BACKUP_BUDGET_BYTES after
  reviewing storage allowance and expected retained changes (Step 3; owner
  confirmation, November 27; exact saved value not supplied in chat).
- [x] **R5 — Backup project:** verify Data API is disabled on the replacement
  Frankfurt backup project, with Auth and Storage available (Step 1; owner
  confirmation, November 27).
- [x] **R6 — GitHub configuration:** verify all required secret/variable names,
  main-only environment restrictions, branch protection and failure-email
  settings; keep PRODUCTION_AUTOMATION_ENABLED=false (Step 6; owner confirmations,
  November 27). Actual provider access and failure-email delivery remain rollout checks.
- [ ] **R7 — Publish and validate:** obtain commit/push authorization, review
  and publish the implementation, then require all CI jobs green for the exact
  SHA, including Linux/container operations acceptance (Step 7).
- [ ] **R8 — First hosted backup:** coordinate a no-edit window, verify the
  live SHA and native Render Auto-Deploy off, then run bootstrap-backup and record
  a completed paired database/PDF snapshot (Step 8).
- [ ] **R9 — First restore rehearsal:** run restore-check for that snapshot;
  require successful decryption and disposable database/PDF restoration (Step 8).
- [ ] **R10 — Hosted access acceptance:** verify actual source read-only,
  writer read/insert, reader read-only and pruner read/delete rights, without
  overwrite/delete/cross-bucket access beyond each account's scope (Steps 2/6).
- [ ] **R11 — Initial safeguard release:** obtain separate deployment consent,
  ensure the verified backup is fresh, deploy the exact CI-green SHA with
  operations disabled and compressed PDF writes off, and verify migration/data
  preservation and readiness (Step 9).
- [ ] **R12 — Restricted grants and migrated backup:** apply and verify the
  new operations-table grants, then take and restore-check a new paired backup
  of the migrated live SHA before the next Render configuration deployment
  (Step 9).
- [ ] **R13 — Runtime configuration:** install the read-only gate URL, matching
  DEPLOY_CHECK_TOKEN and operations enable setting in Render during the protected
  window; configure /health/ready/ and keep native Auto-Deploy off (Step 9).
- [ ] **R14 — Live verification:** pass workflow mode verify for the exact
  live SHA, then check existing-account sign-in, Mass/PDF reads, editing and
  Admin Backups & deployments manually (Step 9).
- [ ] **R15 — Post-setup recovery proof:** after test edits, take another fresh
  paired backup and pass its restore-check; record successful Admin restore status
  and run/snapshot identifiers (Step 9).
- [ ] **R16 — Enable automation:** only after the preceding acceptance steps,
  set PRODUCTION_AUTOMATION_ENABLED=true while available to monitor (Step 10).
- [ ] **R17 — First coordinated backup:** verify automated maintenance,
  database/PDF snapshot, retention and recovery of editing (Step 10).
- [ ] **R18 — First automatic release:** release a separately reviewed newer
  CI-green commit; verify backup before deployment, exact live SHA, operational
  checks and recovery of editing (Step 10).
- [ ] **R19 — Close out activation:** confirm failure-email delivery and record
  the activation date, run/deployment/snapshot IDs and measured editing pause
  (Step 10).

## Understand the setup before continuing

**GitHub Actions coordinates the work.** It reads the live database and PDFs,
encrypts a paired backup, uploads it to the separate backup project, and verifies
it. For releases it first checks the tests, then pauses editing, takes the backup,
asks Render to deploy the exact tested commit, checks the running app and reopens
editing. Once enabled, this runs in the cloud without leaving your PC switched on.

**Supabase has two different jobs.** The production project holds Choralation's
live PostgreSQL records and the `sheet-music` PDF bucket. The separate Choralation
Backup project holds encrypted database export files, PDF copies and manifests in
the private `choralation-backups` bucket. Its database is not a second running
Choralation application database. Render runs the live application.

**A publishable key, an automation account and a policy work together.** The key
identifies the project API client. Signing in as the automation account supplies
a short-lived user token. Storage checks database access policies against that
user's UUID and the requested bucket/file. Creating the user or entering an API
key alone does not grant that user permission to read private PDFs. These
Supabase Auth automation accounts are separate from Choralation users and the
PostgreSQL roles in Step 4.

**Permissions are one-time setup; backup jobs are automatic operation.** We use
the SQL Editor or Storage policy interface once to install reviewed access rules.
Routine jobs then use the Storage API and restricted PostgreSQL connections;
they do not open the SQL Editor, run these CREATE POLICY statements again, or
need a dashboard administrator login. Revisit policies if the automation user's
UUID, bucket or intended access changes. Rotating a password with the same UUID
requires updating the relevant GitHub secret, not recreating the policy.

## Already completed

These settings were verified in the dashboard or reported complete by the owner.
Saved secrets have not yet been tested against the providers.

- [x] Separate Supabase project **Choralation Backup**, reference
  `rkusfrltpycgkeodtxca`, Frankfurt region `eu-central-1`.
- [x] Private bucket **choralation-backups**, effective 50 MB upload limit, any
  MIME type. The bucket has no backup files yet.
- [x] Three confirmed Supabase Auth automation users created in that project.
- [x] Four backup Storage policies installed and verified in SQL results:
  bucket SELECT; object SELECT, INSERT and DELETE, each scoped to the intended
  account and bucket. Writer has read/insert, reader read, pruner read/delete.
- [x] GitHub environments created: **production-operations**, **backup-restore**,
  **backup-retention**. Owner reports a Branch `main` restriction on each.
- [x] Repository variables entered: `BACKUP_PROJECT_REF=rkusfrltpycgkeodtxca`,
  `BACKUP_REGION=eu-central-1`, `PRODUCTION_AUTOMATION_ENABLED=false`.
- [x] Corresponding email/password secrets entered in each environment:

| Environment | Email secret | Password secret | Supabase Auth email |
| --- | --- | --- | --- |
| production-operations | BACKUP_WRITER_EMAIL | BACKUP_WRITER_PASSWORD | tofi.lattouf+backup-writer@gmail.com |
| backup-restore | BACKUP_READER_EMAIL | BACKUP_READER_PASSWORD | tofi.lattouf+backup-reader@gmail.com |
| backup-retention | BACKUP_PRUNER_EMAIL | BACKUP_PRUNER_PASSWORD | tofi.lattouf+backup-pruner@gmail.com |

These are infrastructure accounts, separate from Choralation user accounts and
from the PostgreSQL roles created in Step 4. Do not recreate them or rerun the
already-applied backup-policy query.

Useful pages:

- [GitHub environments](https://github.com/tofi-75/Choralation/settings/environments)
- [GitHub Actions variables](https://github.com/tofi-75/Choralation/settings/variables/actions)
- [GitHub Actions](https://github.com/tofi-75/Choralation/actions)
- [Supabase backup project](https://supabase.com/dashboard/project/rkusfrltpycgkeodtxca)
- [Existing Render service](https://dashboard.render.com/web/srv-db78nlbbc2fs73e83qi0)

## 1. Add the backup project's publishable key

Browser only; approximately 5 minutes.

1. In Supabase select **Choralation Backup**, checking the reference above.
2. Open **Project Settings → API Keys → Publishable and secret API keys**.
3. Copy the **publishable** key beginning `sb_publishable_`. If no publishable key
   exists, create one using that section's publishable-key action. This is used
   in the API-key header; the automation user's signed-in JWT controls RLS access.
   Do not create or supply a secret/service-role key for the backup jobs.
4. In GitHub open **Settings → Environments → production-operations**.
5. Under **Environment secrets**, click **Add environment secret**, name it
   `BACKUP_PUBLISHABLE_KEY`, paste the value and save.
6. Add the same secret with the same value to **backup-restore** and
   **backup-retention**.

- [x] `BACKUP_PUBLISHABLE_KEY` saved in all three environments (owner report, November 27).
- [x] Verify the replacement backup project's **Data API** is off in project
  API settings. Disabling Data API concerns database REST access; keep Auth and
  Storage available (owner confirmed replacement project, November 27).

Enter secrets directly in GitHub or the password manager. Do not paste them in
chat, screenshots, source files or repository variables.

## 2. Configure read access to the production PDFs

Browser plus a reviewed SQL policy; approximately 15–25 minutes.

### Why use the SQL Editor for file permissions?

Supabase stores its file-access rules as PostgreSQL **Row Level Security (RLS)
policies**. A file is stored in Storage; its metadata row in `storage.objects`
lets the policy decide whether a particular account may access it. The SQL below
creates permission rules; it does not import the PDFs into database tables or
start a backup.

The SQL Editor is the dashboard's way to apply those exact rules as the project
owner. It is used here because the reviewed statements are precise, reproducible
and easy to verify: allow SELECT for one UUID in one bucket. It is a setup method,
not a requirement to perform future backups manually.

| Rule | What it permits |
| --- | --- |
| `choralation_backup_source_objects_read` on `storage.objects` | Read/list the files in `sheet-music` as the specified source reader. |
| `choralation_backup_source_bucket_read` on `storage.buckets` | Read metadata for that one bucket as the same reader. |

`FOR SELECT` grants reading; neither statement grants INSERT, UPDATE or DELETE.
`TO authenticated` is narrowed by both the exact `auth.uid()` and bucket
condition, so it does not give every signed-in account access. Existing permissive
policies combine with OR, which is why we inspect them before calling the reader
read-only. Source files are left in place and keep their quality.

The object policy controls file access. The bucket policy concerns bucket-level
methods; the current REST file operations do not require it, but the reviewed
setup includes it for scoped bucket metadata access. See
[Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control).

### Equivalent dashboard alternative

You can use **Storage → Policies** (or the bucket's Policies view) to create the
same underlying policy instead of entering CREATE POLICY in the SQL Editor.
For the object rule, choose a custom policy on `storage.objects`, operation
**SELECT**, role **authenticated**, and this USING expression:

```sql
bucket_id = 'sheet-music'
AND auth.uid() = 'bd179bb0-6208-4907-addb-dfd0b4eefb95'::uuid
```

For the bucket metadata rule, use `storage.buckets` and the condition below if
that policy editor is available; otherwise use the SQL statement in this step:

```sql
id = 'sheet-music'
AND auth.uid() = 'bd179bb0-6208-4907-addb-dfd0b4eefb95'::uuid
```

Use the same names and SELECT/authenticated settings shown above. Choose either
the dashboard policy editor or the SQL creation statements for each rule, then
verify the result. Do not create the same rule twice through both interfaces.

### Source project procedure and verification

1. In Supabase switch to the **production project containing the existing
   sheet-music bucket**, not Choralation Backup. Confirm its project reference
   agrees with the current app's S3 endpoint in Render's Environment settings.
   Do not change the running app's settings at this step.
2. Record that project's reference from its dashboard.
3. In GitHub **Settings → Secrets and variables → Actions → Variables**, add
   repository variable `SOURCE_PROJECT_REF`. Source and backup project references
   must be different. The backup REST client no longer needs region variables;
   the already-entered `BACKUP_REGION` can remain as an unused setup record.
4. In the production Supabase project open **Authentication → Users → Add user
   → Create new user**. Suggested email:
   `tofi.lattouf+source-backup-reader@gmail.com`. Set a unique strong password,
   save it in the password manager, and select Auto confirm. Copy the user's UUID.
   Choralation accounts themselves are in Django; this automation account does
   not grant application access.
5. Review **Storage → Policies** for `sheet-music`, including policies applying
   to all buckets. Existing permissive policies combine with OR. A policy granting
   all authenticated users upload/delete access would also grant it to this user;
   resolve that before relying on this identity being read-only. Preserve the
   application's existing access rules.
   The November 27 screenshots confirmed the source reader below is verified,
   `sheet-music` has `public=false`, and the Storage policy query returned no rows.
   For a fresh setup or if project settings have changed, run these read-only
   checks separately so each result is visible:

```sql
SELECT id, email, email_confirmed_at IS NOT NULL AS confirmed
FROM auth.users
WHERE id = 'bd179bb0-6208-4907-addb-dfd0b4eefb95';
```

Expected: one row, email `tofi.lattouf+source-backup-reader@gmail.com`, and
`confirmed=true`.

```sql
SELECT id, public
FROM storage.buckets
WHERE id = 'sheet-music';
```

Expected: one row with `public=false`.

```sql
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename IN ('objects', 'buckets');
```

Before the source policies were created this returned **Success. No rows returned**.
If it now shows policies, review their rules; do not assume all results should be
deleted. After creation, the two intended SELECT policies should appear here.

6. Open a new query in the **production project's SQL Editor**. Review the
   [source policy template](../scripts/ops/source-storage-policies.sql). The file
   uses a `psql` variable, so do not paste it unchanged into the SQL Editor.
   The browser-ready query below contains the verified source reader UUID for
   this setup. On a different project/account replace it with the UUID confirmed
   by the checks above. Execute once in the production project:

```sql
BEGIN;
CREATE POLICY choralation_backup_source_objects_read
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'sheet-music'
    AND auth.uid() = 'bd179bb0-6208-4907-addb-dfd0b4eefb95'::uuid);
CREATE POLICY choralation_backup_source_bucket_read
  ON storage.buckets FOR SELECT TO authenticated
  USING (id = 'sheet-music'
    AND auth.uid() = 'bd179bb0-6208-4907-addb-dfd0b4eefb95'::uuid);
COMMIT;

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage'
  AND policyname LIKE 'choralation_backup_source_%';
```

Expected: exactly two rows matching the policy names above, both **SELECT**.
Only mark the policy checkbox complete after verifying those rows. If a policy
already exists, inspect it instead of rerunning creation or dropping it blindly.
Successful policy creation still needs a later real API read and effective
permission check during attended acceptance; it does not prove a backup has run.

7. In the production project's **Project Settings → API Keys → Publishable and
   secret API keys**, copy its **publishable** `sb_publishable_…` key.
8. In GitHub environment **production-operations**, add these secrets:

| Secret | Value |
| --- | --- |
| SOURCE_PUBLISHABLE_KEY | Production project's publishable key |
| SOURCE_BACKUP_EMAIL | Email of the source reader just created |
| SOURCE_BACKUP_PASSWORD | That source reader's password |

- [x] Source project reference recorded and repository variable saved (owner confirmation, November 27).
- [x] Source reader created and confirmed; UUID/email verified from the owner's screenshot (November 27).
- [x] Production `sheet-music` bucket confirmed private (November 27).
- [x] Pre-grant Storage policy review returned no existing policies (November 27).
- [x] Two source SELECT policies applied and the two result rows verified (owner screenshot, November 27).
- [ ] Effective source read-only access and cross-bucket denial checked through the API.
- [x] Three source secrets saved in production-operations (owner confirmation, November 27; API authentication untested).

## 3. Generate the backup encryption key

One terminal step, then browser; approximately 10 minutes. This is separate from
Supabase API keys. The public recipient encrypts; the private identity decrypts.
Losing the private identity makes existing encrypted backups unusable.

**Current setup:** the identity was generated once on November 27 and a sample
encryption/decryption round trip passed. It is stored in Git-ignored
`.local/operations/backup-age-identity.txt`. Do not regenerate it. Its public
recipient is:

```text
age1x28785mcf4w3wdu8035xascch3h9jyz5p9snedzygr3wg7mwn94s9v96sz
```

Continue with the password-manager/recovery copy and GitHub entries below. The
generation commands are reference instructions for a fresh setup, not a request
to replace this existing identity.

On the prepared work PC, open PowerShell in the repository. These paths refer
to the existing project-local tools. On another PC, install `age` from its
[official distribution](https://github.com/FiloSottile/age) first and adjust the
executable path.

```powershell
Set-Location 'C:\Users\t.lattouf\Projects\Choralation'
New-Item -ItemType Directory -Force -Path '.local\operations' | Out-Null
& '.\.local\age-v1.3.2\age-keygen.exe' -o '.local\operations\backup-age-identity.txt'
& '.\.local\age-v1.3.2\age-keygen.exe' -y '.local\operations\backup-age-identity.txt'
```

Generate once. If that identity file already exists, preserve it and check whether
it is the intended key; do not replace it simply to retry setup. `.local` is
Git-ignored but is not an off-PC backup.

1. Save the identity file's `AGE-SECRET-KEY-…` value in the password manager and
   keep a second owner-controlled recovery copy outside this PC/GitHub.
2. Save the printed **public** `age1…` value as repository variable
   `BACKUP_AGE_RECIPIENT`.
3. Add environment secret `BACKUP_AGE_IDENTITY`, using the **private** identity,
   to **backup-restore** and **backup-retention**. The writer environment only
   receives the public recipient.
4. Choose an explicit repository variable `BACKUP_BUDGET_BYTES`. The implementation
   default is `858993459` (about 0.8 GiB), but only use that value if the project's
   current allowance and data size support it. Review Supabase usage for all
   projects, PDF sizes, expected retained changes and transfer usage. Encryption
   does not make the payload smaller. Do not upgrade billing without deciding to.

- [x] One encryption identity generated locally and encryption/decryption verified (November 27).
- [x] Private identity saved in the password manager and a second owner-controlled recovery copy (owner confirmation, November 27).
- [x] Public recipient variable and two private identity secrets saved (owner confirmation, November 27).
- [x] Storage budget selected and saved as BACKUP_BUDGET_BYTES (owner confirmation, November 27; retain saved GitHub value).

## 4. Create restricted roles in the production database

Terminal required; allow 20–30 minutes. The three database roles all connect to
the **production application database**, not the backup project's database.

| PostgreSQL role | Purpose | Where its URL goes |
| --- | --- | --- |
| choralation_backup | SELECT on public application tables | production-operations / BACKUP_DATABASE_URL |
| choralation_operations | Read/update operations state after migration | OPERATIONS_DATABASE_URL in all three GitHub environments |
| choralation_gate | SELECT on operations state after migration | Render / OPERATIONS_DATABASE_URL |

The two settings named `OPERATIONS_DATABASE_URL` intentionally use different
roles: GitHub controls maintenance, while the running app only reads its gate.

1. In production Supabase choose **Connect → Session pooler**. Record the exact
   host, port **5432**, database and owner username. The supplied username is
   usually `postgres.PROJECT_REF`. Do not choose transaction pooling/6543.
2. From PowerShell at the repository root, connect using the owner-supplied
   production values below and a hidden password prompt. On another project,
   replace the host/user/database with its own verified Connect values:

```powershell
Set-Location 'C:\Users\t.lattouf\Projects\Choralation'
& '.\.local\postgres\bin\psql.exe' 'host=aws-1-eu-central-1.pooler.supabase.com port=5432 dbname=postgres user=postgres.lhwtctrekcllnpselhsb sslmode=require connect_timeout=15' -X -W
```

3. At the `psql` prompt, verify the intended database and owner, then apply the
   role template. Stop on any error; do not continue with incomplete grants.

```text
\set ON_ERROR_STOP on
SELECT current_database(), current_user;
\i scripts/ops/database-roles.sql
\password choralation_backup
\password choralation_operations
\password choralation_gate
\q
```

Use three different strong passwords and save them privately. `\password` prompts
do not put the plaintext password into the SQL script or command history. Do not
paste `\password` or `\i` into Supabase's SQL Editor: these are `psql` commands.
The template assumes database `postgres`; review its CONNECT grant if your
production database has another name. Run as the application table owner; its
future-table grants must match the actual migration owner.

4. Exit the `psql` prompt with `\q` and run the owner helper from **PowerShell**.
   It uses hidden password prompts to test each restricted role, checks identity,
   elevated-role flags and the expected access to the hymn table, then constructs
   the three URLs with password encoding handled locally:

```powershell
Set-Location 'C:\Users\t.lattouf\Projects\Choralation'
& '.\.venv\Scripts\python.exe' '.\scripts\setup_operations_database.py' --host aws-1-eu-central-1.pooler.supabase.com --project-ref lhwtctrekcllnpselhsb --database postgres
```

   Enter each role's existing password from the password manager when prompted.
   The helper never asks for the administrator password, prints passwords/URLs,
   or performs writes to the database. It saves nothing if a login check fails.
   After all checks pass, URLs are written to the new Git-ignored directory
   `.local/operations/database-urls`. On Windows the directory's inherited access
   is replaced with access for the current owner; on POSIX it uses owner-only
   directory/file permissions. An existing output directory is never overwritten;
   inspect its files before deciding whether a repeat setup is needed.

5. Open each generated file privately and copy its URL directly into the target
   settings below. Do not paste it in chat or screenshots. Save it in the password
   manager as well. Newlines at the end of these text files are not part of the URL.

| Generated file in .local/operations/database-urls | Destination |
| --- | --- |
| BACKUP_DATABASE_URL.txt | GitHub environment production-operations, secret BACKUP_DATABASE_URL |
| GITHUB_OPERATIONS_DATABASE_URL.txt | GitHub environments production-operations, backup-restore and backup-retention, secret OPERATIONS_DATABASE_URL in each |
| RENDER_OPERATIONS_DATABASE_URL.txt | Keep privately for Step 9; later Render OPERATIONS_DATABASE_URL uses this gate-reader URL |

6. Keep Render's environment unchanged at this step. Its guard URL and enable
   flag are configured only after the first verified backup/restore and safeguard
   deployment in Step 9. The controller/gate roles' operations-table grants also
   wait for that migration.

For manual URL construction or reviewing the helper's output, a Session-pooler
custom-role username is `ROLE.SOURCE_PROJECT_REF`. Preserve the exact pooler host
and database. Percent-encode password characters locally; do not use a public
encoding website. The general shape is:

```text
postgresql://ROLE.SOURCE_PROJECT_REF:ENCODED_ROLE_PASSWORD@SESSION_POOLER_HOST:5432/postgres?sslmode=require
```

- [x] Connected to production and confirmed database/user and application table owner are postgres (owner output, November 27).
- [x] Three restricted production database roles created and passwords set (owner report, November 27).
- [x] Reader SELECT/default privileges installed through the reviewed owner script (owner report, November 27).
- [x] Three actual restricted-role logins and expected access verified against production with read-only queries (November 27).
- [x] Three private, correctly encoded URL files generated locally and their exact production targets verified (November 27).
- [x] Backup URL and three controller URL secrets saved (owner confirmation, November 27).
- [x] Gate URL retained privately in its generated file; table-specific grants await Step 9.

See [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres).

## 5. Prepare the deployment credential and operational check

Browser; approximately 5–10 minutes for the remaining credential entry.

1. In Render open **Account Settings → API Keys → Create API key**.
2. Name it `Choralation GitHub operations`. Select **Toufic's workspace**, ID
   `tea-cvbfi652ng1s73ed31g0`.
3. Grant **Services: Read** and **Deploys: Run**. Leave unrelated permissions off.
   The implementation reads service configuration/deployment history and triggers
   deployments; it does not need environment-secret access. Save the newly shown
   key directly as `RENDER_API_KEY` in **production-operations** and retain it
   in the password manager. See [Render API key permissions](https://render.com/docs/api-keys).
4. A random 32-byte URL-safe token for `DEPLOY_CHECK_TOKEN` was generated locally
   on November 27 in Git-ignored `.local/operations/deployment-check/DEPLOY_CHECK_TOKEN.txt`.
   Open that file privately and retain its existing value; do not regenerate it.
   This is a
   machine credential for the read-only operational endpoint, not an application
   account, Supabase key, database password or encryption identity. Keep the token
   in the password manager and a Git-ignored local file; never print it in chat,
   logs, command arguments or a repository variable. If an owner-prepared token
   file already exists, retain it rather than regenerating it.
5. In GitHub environment **production-operations**, save the token as environment
   secret **DEPLOY_CHECK_TOKEN**. Retain the same value for Render's setting of
   that name in Step 9. Do not save/deploy Render environment changes before the
   fresh verified backup and attended rollout window.
6. The live library must contain at least one active hymn with a valid uploaded
   PDF. The probe automatically selects an existing attachment and validates a
   bounded read, including gzip decoding and saved size/checksum where available.
   No test account, new choir, Mass, hymn or fixed fixture IDs are required. A
   library without an uploaded PDF fails this deployment check; do not claim that
   a bucket listing alone verifies PDF reads.

### What operational checks cover

The release job calls protected **GET /health/operations/** before pausing edits
and after deployment. Its bearer token works only for that diagnostic endpoint;
it cannot sign in, fetch user-facing records or bypass application permissions.
The endpoint performs no database/content writes and returns only status, the
running commit and maintenance flags. Responses are never cached. Authentication
failures are 403; dependency failures are generic 503 with no record/provider details.

It checks applied/consistent migrations, actual application queries, the intended
production database UUID, the dedicated maintenance gate connection/advisory lock,
and a real existing PDF read through the app's S3 connection. The worker requires
the exact running SHA and expects editing enabled before the release and paused
after deployment until verification succeeds. Failure before deployment prevents
it; failure after a deployment request leaves maintenance in place for recovery.

Render's frequent health checks continue using the lightweight **/health/ready/**,
not the storage-reading protected endpoint. After Step 9's configuration is live,
dispatch workflow mode **verify**, branch main, with the live full SHA to run an
idle operational check while the automation switch is still false. It neither
backs up nor deploys. An unresolved operation blocks that idle check.

**Coverage tradeoff, approved November 27:** production checks do not attempt a
normal user's sign-in, session/CSRF flow or member permissions. Those flows remain
in isolated CI/browser tests, including login, Mass/PDF reads and denied edits.
Restore rehearsals verify reconstructed data and authenticated/anonymous PDF access
in disposable infrastructure. Use an existing account for an attended sign-in and
Mass/PDF check during initial rollout. Production configuration bugs specific to
real user authentication can escape the automatic operational check.

- [x] Scoped Render key saved in production-operations as RENDER_API_KEY (owner report, November 27; API access untested).
- [ ] Reconfirm native Render Auto-Deploy remains off before the attended rollout.
- [x] DEPLOY_CHECK_TOKEN generated once in the owner-restricted, Git-ignored local file (November 27).
- [x] DEPLOY_CHECK_TOKEN retained in the password manager and saved in GitHub production-operations (owner confirmation, November 27; hosted verification pending).
- [ ] Same token installed in Render during Step 9; protected operational verification passed.

## 6. Check the complete GitHub configuration

In **Settings → Environments**, review each environment. All must have
**Deployment branches and tags → Selected branches and tags → Branch: main**.
Leave routine required-reviewer and wait-timer gates unchecked for automatic runs.
See [GitHub environment setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

Use the **Environment secrets** section, not environment variables or repository
secrets, for these names:

| Environment | Required secrets |
| --- | --- |
| production-operations | BACKUP_WRITER_EMAIL, BACKUP_WRITER_PASSWORD, BACKUP_PUBLISHABLE_KEY, SOURCE_PUBLISHABLE_KEY, SOURCE_BACKUP_EMAIL, SOURCE_BACKUP_PASSWORD, BACKUP_DATABASE_URL, OPERATIONS_DATABASE_URL, RENDER_API_KEY, DEPLOY_CHECK_TOKEN |
| backup-restore | BACKUP_READER_EMAIL, BACKUP_READER_PASSWORD, BACKUP_PUBLISHABLE_KEY, BACKUP_AGE_IDENTITY, OPERATIONS_DATABASE_URL |
| backup-retention | BACKUP_PRUNER_EMAIL, BACKUP_PRUNER_PASSWORD, BACKUP_PUBLISHABLE_KEY, BACKUP_AGE_IDENTITY, OPERATIONS_DATABASE_URL |

In **Settings → Secrets and variables → Actions → Variables**, check repository
variables. Avoid environment-level overrides of these shared values:

| Variable | Value |
| --- | --- |
| BACKUP_PROJECT_REF | rkusfrltpycgkeodtxca |
| SOURCE_PROJECT_REF | lhwtctrekcllnpselhsb |
| BACKUP_AGE_RECIPIENT | Public age1… recipient |
| BACKUP_BUDGET_BYTES | Chosen integer storage budget in bytes |
| PRODUCTION_AUTOMATION_ENABLED | false |

- [x] All required secret/variable entries reported saved in their intended scopes by the owner; provider/API acceptance remains separate (November 27).
- [x] Protect `main` using a branch rule/ruleset: require the **checks**
  status from **Application checks**, block force pushes and branch deletion.
  Review workflow changes before merging. If the plan does not support the rule,
  resolve that before activation rather than assuming it is enforced. Owner
  confirmed the instructed active ruleset created, November 27.

The owner's November 27 Branch settings screenshot showed the add-rule controls
with no protection rule listed. The owner subsequently confirmed creating the
instructed ruleset. For reference, to create it,
choose **Add branch ruleset**, name it **Protect main**, set enforcement **Active**,
and target **Include default branch** (main). Leave the bypass list empty. Enable
**Restrict deletions**, **Block force pushes**, and **Require status checks to pass**;
add the exact **checks** status from Application checks, choosing GitHub Actions
as its expected source if offered. Create the ruleset and verify it is active
for main. If the check is unavailable or GitHub reports enforcement requires a
different plan, record that unresolved item rather than checking this box.
See [GitHub ruleset setup](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/creating-rulesets-for-a-repository).

- [x] Enable GitHub Actions failure emails in your personal notification settings
  and check the destination email address. Open **Settings → Notifications → System
  → Actions**, select **Email** and **Only notify for failed workflows**, then save.
  See [GitHub Actions notifications](https://docs.github.com/en/subscriptions-and-notifications/how-tos/managing-github-actions-notifications).
  Owner confirmed saved, November 27. Verify delivery during attended setup (R19).
- [ ] Confirm the private bucket and effective RLS rights: source read-only;
  writer read/insert with no overwrite/delete; reader read-only; pruner read/delete;
  no unintended cross-bucket access. The first backup tests real reads/uploads and
  the restore tests real reader access; local policy tests alone are insufficient.

The previously discussed anon-key secret names are obsolete. Use the publishable
names in these tables; the new client rejects legacy JWT keys and elevated secret
keys. Existing writer/reader/pruner passwords and RLS policies remain applicable.
The running app's separate S3 credentials and region settings are unchanged.

You can complete Steps 1–6 without deploying. Keep the enable variable false.

## 7. Publish the implementation and pass CI

The owner authorized commit/push of the current operations batch on November 27.
Publishing/CI is in progress through a codex branch and pull request; protect main's
required checks. No application deployment is authorized at this stage.

1. Review the local diff and commit/push the reviewed implementation to `main`.
   The new workflow cannot be dispatched until it exists on GitHub's default
   branch. See [manual workflow runs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
2. Open **Actions → Application checks**, select the pushed full SHA and wait for
   all jobs to pass, including the new **operations** Linux/container job and the
   final **checks** result. A previous green run does not validate this batch.
3. Confirm **Production operations** is visible. An automatic deploy attempt
   selected while the enable flag is false must skip actual operations.

- [ ] Reviewed implementation on main; all required CI jobs green for that SHA.
- [ ] No live application deployment yet; automation remains false.

## 8. Take the first paired backup and rehearse restoration

Allow a coordinated quiet window. The current live code has no automatic write
barrier: ask everyone to stop edits/uploads and avoid dashboard/SQL content
changes throughout the backup. Reads can continue.

1. In Render open Choralation's **Events** and record the **currently live full
   40-character commit SHA**. The last observed live commit was
   `91a8c566094383eb21a2e69ad2878dcf75601c54`; verify the current value rather than
   reusing it blindly. The backup describes the live schema/code, not the new
   implementation waiting on main.
2. In GitHub **Actions → Production operations → Run workflow**, choose branch
   **main** and fill in:

| Input | First backup value |
| --- | --- |
| mode | bootstrap-backup |
| sha | Currently live full SHA from Render |
| ci_run_id, snapshot, operation_id | Leave blank |
| schema_reviewed | Leave false |

3. Wait for **operate** to succeed. Record the completed snapshot `id` from its
   JSON result and the workflow run URL in an operations record. Confirm the
   destination bucket now contains encrypted objects and a completion record.
   Encrypted PDFs are not expected to open in the Supabase preview.
4. Run the same workflow again, branch **main**, with `mode=restore-check`,
   `snapshot` set to that completed snapshot ID, and other inputs blank/false.
5. Wait for **restore** to succeed. It restores DB/PDFs only into disposable
   Linux resources, verifies data and access using the captured historical code,
   and cleans up. It never restores over production.

- [ ] Completed paired DB/PDF snapshot ID recorded.
- [ ] Full hosted-data restore rehearsal green for that exact snapshot.

**Stop if either run fails.** Fix the configuration and repeat backup/restore
before deploying. If edits resume or significant time passes, take a fresh pair
before the deployment window. A successful DB-only dump is insufficient.

## 9. Install and enable the application's backup safeguards

This is the first application deployment and requires separate release consent.
Continue in a coordinated no-edit window with the fresh verified backup above.
Render configuration saves can trigger deployments too.

1. In Render confirm **Choralation** service `srv-db78nlbbc2fs73e83qi0`, workspace
   `tea-cvbfi652ng1s73ed31g0`, branch `main`, native **Auto-Deploy off**.
2. Manually deploy the **specific reviewed, CI-green implementation SHA** from
   Step 7. Keep `PRODUCTION_OPERATIONS_ENABLED=false` for this first startup,
   and keep `PDF_COMPRESSED_WRITES=false`. Preserve startup migrations and the
   app's existing business database/S3 credentials and stable Django secret.
3. Verify startup migrations succeeded and the app serves the selected SHA at
   [readiness](https://choralation.onrender.com/health/ready/). At this point
   `operations_enabled` is expected to be false.
4. Reconnect as the production application table owner using Step 4's `psql`
   procedure. Apply these table grants now that the migration exists:

```sql
GRANT SELECT, UPDATE ON public.common_operationsstate TO choralation_operations;
GRANT SELECT ON public.common_operationsstate TO choralation_gate;
```

5. Check each restricted login against the intended database: backup reader can
   read application tables, controller can read/update only the operations table,
   gate can read only that table. The backup reader's future-table privileges
   should include this new table. Do not grant either operations role general
   write access to app tables.
6. Still without application edits, repeat **bootstrap-backup** with the **newly
   live SHA**, then **restore-check** for its new snapshot. This protects the
   migrated schema before the next Render configuration deployment and records
   a successful restore in the installed operations table.
7. In Render **Environment**, set these values, then save/deploy in the same
   protected window:

| Render setting | Value |
| --- | --- |
| OPERATIONS_DATABASE_URL | Production Session-pooler URL for choralation_gate |
| PRODUCTION_OPERATIONS_ENABLED | true |
| DEPLOY_CHECK_TOKEN | Same private token as the production-operations GitHub secret |
| PDF_COMPRESSED_WRITES | false |

8. In Render **Settings → Health Check Path**, set `/health/ready/`. Native
   **Auto-Deploy remains off**. Do not blindly sync the entire Blueprint.
9. Verify readiness returns the expected full `commit`, `status: ok` and
   `operations_enabled: true`. Run **Production operations → verify** for the exact
   live SHA; require success. Manually check sign-in, Mass/PDF access and ordinary
   editing with an existing account. Check Admin **Settings → Backups & deployments** loads.
10. Keep GitHub automation false. After any test edits, take a fresh
    **bootstrap-backup** of this live SHA and run its **restore-check**. Confirm
    the Admin restore summary succeeds. Record the run URLs and pause timing.

- [ ] Safeguard release live; operations table/grants preserved existing data.
- [ ] Gate URL uses the read-only role; both URLs address the production database.
- [ ] Live readiness protection and health-check path verified.
- [ ] Fresh post-setup backup and recorded restore rehearsal succeeded.
- [ ] Member reads/PDFs, Admin status and normal editing verified.

Do not run normal `backup` while GitHub automation is false; use
`bootstrap-backup`. Do not infer activation from the new Admin tab alone.

## 10. Enable automation and observe its first runs

Do this while available to monitor failures. Enabling the switch allows the
scheduled jobs and future successful main-push CI runs to operate production.

1. Confirm every acceptance box above is complete and native Render Auto-Deploy
   is off. Confirm the recorded successful restore is less than eight days old.
2. In repository **Actions → Variables**, edit
   `PRODUCTION_AUTOMATION_ENABLED` from `false` to `true`.
3. Immediately dispatch **Production operations**, branch main, `mode=backup`,
   with other inputs blank/false. Verify the temporary editing pause, readable
   PDFs, successful snapshot, successful retention and recovery of editing.
   The Admin last-backup summary should now be populated.
4. Release a separately reviewed, CI-green newer commit while monitoring. Once
   its **Application checks** push run succeeds, **Production operations** should
   back up first, deploy that exact SHA, verify readiness and protected
   database/schema/gate/PDF operational checks, then reopen editing. Native Render auto-deploy stays off.
   Re-running an already-live commit does not demonstrate a successful release.
5. Record the snapshot ID, CI/deploy run URLs, Render deployment ID, exact live
   SHA, read-only duration and editing recovery. Confirm failure emails reach you.

- [ ] First coordinated automatic backup and retention passed.
- [ ] First automatic release passed for the intended newer SHA.
- [ ] Notifications and editing recovery checked; activation recorded.

After acceptance, daily backups run at **03:17 Asia/Beirut**, freshness checks
hourly at minute **43**, and isolated restore rehearsals Sundays at **04:47**.
Retention keeps seven successful daily and five predeployment snapshots, subject
to active-release protection. GitHub scheduling is best effort; inspect failures
and freshness rather than assuming a fixed deadline is guaranteed.

## If something fails, or you need to stop

- Before activation: leave `PRODUCTION_AUTOMATION_ENABLED=false`. You can finish
  credentials on another day without deploying anything.
- To pause future automation: set that variable back to `false`. It does not
  cancel a running job, undo a deployment or clear maintenance. Avoid canceling
  an active backup/deploy midway through its write barrier.
- For an enabled-system failure: run workflow mode **status**, record the
  operation/deployment ID, inspect the specific Render deployment and live SHA.
  Unknown deployment/startup/migration outcomes intentionally leave editing
  paused. Do not manually clear the database flag or retry deployment blindly.
- Use **recover** only after checking no deployment is active and reviewing
  schema compatibility; it needs the exact operation ID and explicit
  `schema_reviewed=true`. See the [recovery runbook](automatic-operations.md#failure-recovery-and-restoration).
- Actual restoration of production is a separate attended operation, requiring
  authorization and a compatible code/schema review. Never reset either Supabase
  project as a shortcut. Preserve current production before replacing data.

## Keep a non-secret setup record

Record completion dates and these values here or in your operations notes; keep
passwords, private keys, full database URLs and private backup contents elsewhere.

| Item | Record |
| --- | --- |
| Production project reference | lhwtctrekcllnpselhsb (owner-supplied Session-pooler username, November 27) |
| Production Session pooler | aws-1-eu-central-1.pooler.supabase.com:5432 / database postgres / owner username postgres.lhwtctrekcllnpselhsb |
| Source reader UUID | bd179bb0-6208-4907-addb-dfd0b4eefb95 (confirmed account and two SELECT policies verified November 27) |
| Public age recipient | age1x28785mcf4w3wdu8035xascch3h9jyz5p9snedzygr3wg7mwn94s9v96sz |
| First backup run / snapshot ID | Pending |
| First restore run | Pending |
| Safeguard implementation SHA / CI run | Pending |
| Safeguard Render deployment ID | Pending |
| Post-setup backup / restore runs | Pending |
| First automatic release SHA / run / deploy ID | Pending |
| Activation date / measured pause | Pending |

The [technical runbook](automatic-operations.md) describes implementation,
retention, recovery and local verification. This checklist is the manual setup
sequence; its checked setup items do not imply that production acceptance passed.
