# Deploy Choralation — Render and Supabase

> **Local implementation, November 21:** [Choir roles, Mass reading and lossless PDFs](roles-reader-pdf-update.md) describes the current checkout and staged rollout. These changes are not part of the live `91a8c56` release.

**Reviewed November 20, 2026.** [Choralation is live](https://choralation.onrender.com) on commit `91a8c56`. Both jobs in [the release CI run](https://github.com/tofi-75/Choralation/actions/runs/43712740786) passed. The current service uses manual deployment, Free runtime compute, private S3 storage, and Supabase PostgreSQL. See [current status](current-status.md) for evidence and outstanding acceptance.

**Existing service, rechecked November 21.** Use [Choralation on Render](https://dashboard.render.com/web/srv-db78nlbbc2fs73e83qi0) in the owner-confirmed Toufic’s workspace. Native automatic deployment is off, and the live HTTP health-check path is empty. The Blueprint now keeps native auto-deploy off and declares `/health/ready/`; the live path still needs attended configuration. The new [backup-gated operations workflow](automatic-operations.md) is implemented locally but not activated.

**Before another release.** Confirm a fresh database backup and a separate PDF bucket backup. Review the commit, wait for the intended CI checks, manually deploy the reviewed revision, then verify its live status, public readiness, assets, and relevant authenticated workflows. Record any remaining acceptance. [Simple accounts](simple-accounts-release.md) documents the active registration mode and owner-assisted recovery. [Durable PDF storage](pdf-storage-setup.md) documents S3 safeguards and file recovery.

The setup sections below support new installations and authorized configuration changes. Existing infrastructure is already provisioned.

## 1. Prepare accounts and GitHub (manual owner steps)

1. Create/sign in to GitHub, Supabase and Render.
2. Create a **private** GitHub repository named `Choralation`. Do not initialize it with a README, license or Gitignore: this folder already has history.
3. Review the current diff and intended release commit. Exclude private files, generated artifacts, and unrelated changes.
4. From PowerShell in this project:

```powershell
Set-Location C:\Users\t.lattouf\Projects\Choralation
git status --short
git diff
# Stage only after reviewing the files; ignored local secrets/data stay excluded.
git add --all
git diff --cached --name-only
git diff --cached
# Confirm no credentials, local uploads, DB files or logs are staged.
git commit -m "Prepare Render hosting with Supabase and deployment checks"
git remote add origin https://github.com/YOUR_GITHUB_USERNAME/Choralation.git
git push -u origin main
```

If `origin` already exists, inspect `git remote -v` and use the existing correct remote rather than adding another. GitHub may request browser login. Never put a personal access token in the remote URL. `.env`, `.env.hosted`, `.local`, caches and PDF uploads are ignored; `.env.hosted.example` contains placeholders only.

## 2. Create Supabase database and private files (manual owner steps)

1. Create a Free project named `Choralation Testing`, in **Frankfurt / eu-central-1**. Save its database password privately.
2. Disable the **Data API** in project API settings (or choose connection-string-only during creation). Django uses PostgreSQL directly and owns account/role checks; no Supabase frontend key or Supabase Auth integration is needed. [Official API security guide](https://supabase.com/docs/guides/api/securing-your-api)
3. Open **Connect → Session pooler**. Copy its PostgreSQL URL on **5432**, not transaction mode on 6543. Replace the password placeholder with the URL-encoded password and append `?sslmode=require` (use `&sslmode=require` if the URL already has a query). Keep the supplied pooler hostname and `postgres.PROJECT_REF` username. [Connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
4. Under Storage, create a bucket named **sheet-music** with **Public bucket disabled**. PDFs are served only through the authenticated Django download endpoint. Do not make the bucket public to resolve permission errors.
5. In Storage S3 settings, obtain the S3 endpoint, region, access-key ID and secret. Copy the exact endpoint displayed by Supabase; do not guess its hostname. These credentials are powerful and must remain server-side. [S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication)
6. Keep the project reference and secrets in your password manager and provider settings, not Git or chat.

Supabase migrations run from the app at first startup. No SQL dump from the local database is required.

## 3. Choose manual deployment or the pipeline

Both modes use the same Dockerfile, database and settings. You do not need two Render services.

### Option A: deploy manually

1. In Render, choose **New → Web Service**, connect your GitHub account and grant access to the private repository.
2. Select repository `Choralation`, branch **main**, region **Frankfurt**, runtime **Docker**, and instance plan **Free**.
3. Leave Root Directory empty. Set Dockerfile Path to **./Dockerfile** and Docker Build Context to **.**. Do not select the development `backend/Dockerfile`.
4. Use the Dockerfile's default command. No separate build command is needed. Set the health-check path to **/health/ready/**.
5. Set **Auto-Deploy: Off**. Enter the settings in section 4 before creating/deploying the service.
6. Click **Create Web Service**. The image builds on Render, then startup runs migrations, provisions roles and creates missing classification defaults. No accounts or fictional hymns are automatically created.
7. Once live, follow sections 5 and 6.
8. For later changes, push the reviewed commit to `main`, check GitHub results, then choose **Manual Deploy → Deploy latest commit**. Render rebuilds that commit. Use Deploy a specific commit if you intentionally need a reviewed older revision.

### Option B: GitHub pipeline with automatic deployment

Use the [automatic backup/deployment runbook](automatic-operations.md). Keep the existing
service and **Auto-Deploy: Off**; native `checksPass` cannot enforce the DB/PDF backup gate.
Do not create another service or synchronize a Blueprint just to enable the workflow.

Complete the separate private backup project, restricted GitHub environments, attended
backup/restore/bootstrap and health-check setup before setting
`PRODUCTION_AUTOMATION_ENABLED=true`. The ordinary CI workflow has no hosted secrets;
only trusted production-operations jobs receive scoped credentials.

Pipeline: **main push → every CI job succeeds → pause editing/drain → verified encrypted
database and PDF snapshot → deploy exact tested SHA → startup migrations/defaults →
readiness and authenticated read checks → reopen editing**. PRs and failed/skipped checks
do not deploy. Unknown outcomes stay read-only for explicit recovery. The workflow and
the live provider configuration are separate; local implementation does not activate it.

## 4. Render environment settings

| Key | Value |
| --- | --- |
| `DJANGO_SECRET_KEY` | Generate a random value of at least 50 characters; keep it stable |
| `DJANGO_DEBUG` | `false` |
| `DATABASE_URL` | Supabase session-pooler URL, with encoded password and SSL |
| `DJANGO_STORAGE_BACKEND` | `s3` |
| `AWS_STORAGE_BUCKET_NAME` | `sheet-music` |
| `AWS_S3_ENDPOINT_URL` | Exact endpoint from Supabase Storage settings |
| `AWS_S3_REGION_NAME` | Exact region from Supabase Storage settings |
| `AWS_ACCESS_KEY_ID` | Private S3 access key |
| `AWS_SECRET_ACCESS_KEY` | Private S3 secret |
| `DJANGO_TRUST_PROXY_HTTPS` | `true` |
| `RUN_STARTUP_MIGRATIONS` | `true` on Free |
| `PRODUCTION_OPERATIONS_ENABLED` | `false` until the attended bootstrap; then `true` |
| `OPERATIONS_DATABASE_URL` | Dedicated session-mode SELECT-only guard account; not the CI controller password |
| `DEPLOY_CHECK_TOKEN` | Same strong private token as GitHub production-operations; configure during attended operations rollout |
| `PDF_COMPRESSED_WRITES` | `false` for the operations rollout |
| `ALLOW_HOSTED_DEMO_DATA` | `true` only while this project is a fictional test deployment |
| `APP_TIME_ZONE` | `Asia/Beirut` |

Internal live/readiness endpoints bypass Django's HTTPS redirect so readiness
actually checks PostgreSQL; Render's public edge provides HTTPS. The protected
`/health/operations/` deployment probe requires HTTPS/token authentication and
reads an existing PDF; do not use it as Render's frequent health-check target.

Render assigns `RENDER_EXTERNAL_HOSTNAME`; the code adds that exact host to allowed hosts and its HTTPS URL to trusted CSRF origins. The Dockerfile enables built-frontend serving and uses Render's `PORT`. Never set `DJANGO_DEBUG=true` to fix deployment errors. Custom domains require explicit `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` additions.

For either deployment mode, generate the Django secret privately on your computer:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy the output into Render's **Environment → DJANGO_SECRET_KEY** value, without additional quotes, and your ignored `.env.hosted` file. Keep it stable. Do not use Render's Generate button for this variable: its 44-character value is shorter than the required 50 characters. Do not paste the generated value into chat or Git. Database/S3 secrets never belong in frontend environment variables or ordinary PR CI. Only the restricted production-operations environments receive the scoped credentials documented in the operations runbook.

## 5. Provision hosted accounts and fictional hymns (manual owner steps)

Render Free has no dashboard shell/SSH or one-off jobs. Run the helper locally against the hosted DB after startup migrations have succeeded. [Free-tier limitations](https://render.com/docs/free)

```powershell
Set-Location C:\Users\t.lattouf\Projects\Choralation
# Do this once; if .env.hosted already exists, edit it instead of overwriting it.
Copy-Item -LiteralPath .env.hosted.example -Destination .env.hosted
# Edit .env.hosted privately with the hosted DB/S3 values from section 4.
# Keep .env for local development unchanged.
. .\scripts\project.ps1
& $ProjectPython scripts/hosted-admin.py check
& $ProjectPython scripts/hosted-admin.py create-admin
& $ProjectPython scripts/hosted-admin.py create-user --username choirmaster --role Choirmaster
& $ProjectPython scripts/hosted-admin.py create-user --username member --role User
& $ProjectPython scripts/hosted-admin.py seed-demo --username YOUR_HOSTED_ADMIN_USERNAME
```

Each command prints the Supabase pooler hostname and asks you to type **HOSTED** before proceeding. Password prompts are hidden; usernames/passwords from the local DB are not copied. `create-user` rejects existing usernames. `seed-demo` creates 36 fictional hymns idempotently, preserves edited/other records, and requires both an explicit hosted flag inside the helper and `ALLOW_HOSTED_DEMO_DATA=true` in `.env.hosted`. The setting is independent of debug mode.

`check` validates Django configuration; the live `/health/ready/` endpoint verifies database connectivity. Keep `.env.hosted` private. When testing ends, turn `ALLOW_HOSTED_DEMO_DATA` off in both Render (including the Blueprint) and `.env.hosted`.

## 6. Live verification and completion (manual owner steps)

Record actual results rather than assuming a passing local test is a hosted test:

- [x] Public URL is [Choralation](https://choralation.onrender.com); current deployed commit is recorded in [Current project status](current-status.md).
- [ ] `/login` loads; anonymous API access and PDF downloads are denied.
- [ ] Admin/Choirmaster/User login and independent Leader/Planner/Member choir permissions work; logout works.
- [ ] Open and refresh `/hymns/ID` and `/masses/ID/edit`; JS/CSS and admin static files load without redirect loops.
- [ ] Create a fictional hymn, upload a PDF up to 10 MB, download it and compare the contents. Replace and remove it. A direct bucket URL is not public.
- [ ] Create/save/reopen/finalize a fictional Mass; selections and history survive refresh.
- [ ] Restart Render; the same account, records and PDF persist.
- [ ] Deploy another reviewed version; the same records and PDF persist.
- [ ] Pipeline mode: verify a failed check or incomplete DB/PDF backup prevents deployment; verify successful exact-SHA release and maintenance recovery. Record the snapshot, deployed commit and pause duration.

Manual hosting is deployed. A configured automatic pipeline requires its own failed-check blocking and successful-deployment acceptance. Physical phone testing is deferred to M5 and does not prevent initial desktop hosted acceptance. Do not intentionally introduce failing commits during a real Mass.

## Troubleshooting, upgrades and portability

- **Build failure:** inspect the first failing step in Render logs. Locked runtime/dependency pins must actually be available; CI checks a Linux image. Local Windows checks alone do not establish this.
- **Secret-key startup failure:** `Set DJANGO_SECRET_KEY ... at least 50 characters` means the runtime value is missing or too short. In Render Environment, add/correct the exact `DJANGO_SECRET_KEY` name using the command above, then save and redeploy. A Docker build-only placeholder is not a runtime secret. Existing Blueprint services need the dashboard correction; changing `sync: false` does not replace an existing value.
- **Database/startup failure:** confirm Session pooler/5432, password encoding, SSL and that the Supabase Free project is active. Failed migrations abort startup before Gunicorn. Do not reset the database or enable debug as a workaround.
- **Redirect loops/CSRF:** check the exact assigned hostname, proxy HTTPS setting and HTTPS origin; the frontend and API must use the same public origin.
- **PDF failure:** check the private bucket name and S3 credentials/endpoint. Storage outages return generic retryable errors; do not expose the bucket publicly.
- **Blank/stale frontend:** HTML revalidates; hashed assets cache indefinitely. Hard-refresh once after a deployment and verify the commit and asset responses. A missing asset is a 404, not the React shell.
- **Free-tier delays:** Render sleeps after 15 minutes without requests and wakes on the next request. Supabase Free can pause after a week of inactivity. Check both before testing; do not rely on these plans for uninterrupted live Mass access.
- **Paid Render upgrade:** check current Render plan identifiers and pricing when an upgrade is authorized. Add `preDeployCommand: python manage.py migrate --noinput && python manage.py provision_roles && python manage.py seed_initial_data`, and change `RUN_STARTUP_MIGRATIONS` to `false`. The image works from `/app/backend`. For a manual service, configure these in its dashboard. Upgrade the existing service; its URL/data remain in place. Paid pre-deploy executes before switching the app version. Keep a paid upgrade separate from routine application deployment.
- **Supabase Pro:** upgrade the existing organization/project when no inactivity pause, daily DB backups or more capacity is needed. No provider switch is required. Database backups do not include PDF objects; maintain a separate bucket backup.
- **Bad release:** disable auto-deploy temporarily if needed, revert the bad commit locally and push the correction after review, or manually deploy a known compatible commit. Code rollback does not undo DB migrations. Use additive/backward-compatible migrations, export before destructive schema changes, and never reset hosted data as a rollback.
- **Export/migrate later:** export PostgreSQL with a compatible `pg_dump` using securely supplied connection settings and export the private bucket through Supabase's Storage tooling/S3 client. Store backup files under ignored `.local/backups`, protect them, and test restoring DB plus PDF objects into a separate destination. Preserve object keys; the DB stores those keys. Accounts use standard Django password hashes. Change `DATABASE_URL` and S3 settings to move providers; no Supabase client SDK/auth coupling has been added.
