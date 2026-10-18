# Deploy Choralation: Render + Supabase

**October 18, 2026 deployment result:** [Choralation is live](https://choralation.onrender.com). Commit `8f6a2b4` built and deployed successfully; public HTTPS readiness, application routes/assets, and anonymous-access checks passed. Private PDF storage configuration and authenticated persistence acceptance remain pending. See the [deployment verification report](render-deployment-verification-2026-10-18.md).

**October 18, 2026 deployment investigation:** The existing [Choralation service](https://dashboard.render.com/web/srv-db78nlbbc2fs73e83qi0) has two failed startup attempts. The latest log rejected `DATABASE_URL`; the current saved value now has a PostgreSQL scheme, but has not been verified in a new deploy. Private S3 settings are also missing from the service environment. See the [analysis, repair plan, work log, and verification report](render-repair-report-2026-10-18.md). The October 13 preparation notes below retain their original context; live acceptance remains pending.

**Prepared October 13, 2026.** Code preparation is separate from deployment acceptance. Accounts, provider login, credentials, GitHub publishing and live verification are owner tasks to complete manually later. No cloud resources or public URL have been created by this preparation. See [hosting verification](hosting-report.md).

One Render Docker service serves React, Django, admin and the existing APIs on one HTTPS origin. Supabase holds PostgreSQL and private PDFs. Existing local data is not copied. Start with fictional hymns and newly provisioned accounts. Physical-phone acceptance moves to M5; saved-Mass performance redesign and recommendations are deferred.

## 1. Prepare accounts and GitHub (manual owner steps)

1. Create/sign in to GitHub, Supabase and Render.
2. Create a **private** GitHub repository named `Choralation`. Do not initialize it with a README, license or Gitignore: this folder already has history.
3. Review all local changes, including the existing uncommitted M4 work. The deployment needs those application files as well as the new hosting files. Nothing has been staged or committed automatically.
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

1. Ensure the committed repository contains `.github/workflows/ci.yml`, `Dockerfile` and `render.yaml`.
2. In Render, connect GitHub and select **New → Blueprint**. Choose the private repository and branch **main**, using the root `render.yaml`.
3. Confirm **one free web service**, Frankfurt, and **no Render database or disk**. PostgreSQL and files belong to Supabase.
4. Supply the secret settings when prompted. Supply your own `DJANGO_SECRET_KEY` of at least 50 characters using the generation command below; keep it stable on subsequent deployments. Render's automatic generator produces 44 characters and does not satisfy this app's validation. The Blueprint supplies other fixed settings.
5. Confirm service settings show **Auto-Deploy: After CI Checks Pass**. The Blueprint uses `autoDeployTrigger: checksPass`. Native integration requires a connected GitHub account; using only a public repository URL is insufficient.
6. Watch GitHub **Actions → Application checks**. It runs backend tests, migration/schema/lint checks, frontend checks/build, all browser projects, and a Linux Docker build/production smoke check. Its databases and file storage are disposable, not Supabase. No hosted secret or deployment hook is needed in GitHub Actions.
7. The initial Blueprint creation can deploy immediately; require the checks to pass before accepting the hosted app. Subsequent pushes/merges to `main` deploy only after checks pass. A failed check blocks auto-deploy; zero detected checks also blocks it. [Render deployment behavior](https://render.com/docs/deploys)
8. Complete account and live acceptance steps below.

Normal pipeline: **push/merge main → checks pass → Render builds that revision → startup migrations/defaults → readiness passes → app goes live**. Development branches run PR checks but do not deploy to this service. Do not add pipeline filters that skip all checks on a `main` commit intended for deployment.

To enable the pipeline on an existing manually created service, keep that service and change Auto-Deploy to **After CI Checks Pass** after the workflow is present. Do not create a second service just to switch deployment modes.

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
| `ALLOW_HOSTED_DEMO_DATA` | `true` only while this project is a fictional test deployment |
| `APP_TIME_ZONE` | `Asia/Beirut` |

Internal health endpoints bypass Django's HTTPS redirect so readiness actually checks PostgreSQL; Render's public edge provides HTTPS.

Render assigns `RENDER_EXTERNAL_HOSTNAME`; the code adds that exact host to allowed hosts and its HTTPS URL to trusted CSRF origins. The Dockerfile enables built-frontend serving and uses Render's `PORT`. Never set `DJANGO_DEBUG=true` to fix deployment errors. Custom domains require explicit `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` additions.

For either deployment mode, generate the Django secret privately on your computer:

```powershell
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(64))"
```

Copy the output into Render's **Environment → DJANGO_SECRET_KEY** value, without additional quotes, and your ignored `.env.hosted` file. Keep it stable. Do not use Render's Generate button for this variable: its 44-character value is shorter than the required 50 characters. Do not paste the generated value into chat or Git. Database/S3 secrets never belong in frontend environment variables or GitHub Actions.

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
& $ProjectPython scripts/hosted-admin.py create-user --username planner --role Planner
& $ProjectPython scripts/hosted-admin.py create-user --username viewer --role Viewer
& $ProjectPython scripts/hosted-admin.py seed-demo --username YOUR_HOSTED_ADMIN_USERNAME
```

Each command prints the Supabase pooler hostname and asks you to type **HOSTED** before proceeding. Password prompts are hidden; usernames/passwords from the local DB are not copied. `create-user` rejects existing usernames. `seed-demo` creates 36 fictional hymns idempotently, preserves edited/other records, and requires both an explicit hosted flag inside the helper and `ALLOW_HOSTED_DEMO_DATA=true` in `.env.hosted`. The setting is independent of debug mode.

`check` validates Django configuration; the live `/health/ready/` endpoint verifies database connectivity. Keep `.env.hosted` private. When testing ends, turn `ALLOW_HOSTED_DEMO_DATA` off in both Render (including the Blueprint) and `.env.hosted`.

## 6. Live verification and completion (manual owner steps)

Record actual results rather than assuming a passing local test is a hosted test:

- [ ] Record the assigned `https://YOUR_SERVICE.onrender.com` URL here: **pending deployment**.
- [ ] `/login` loads; anonymous API access and PDF downloads are denied.
- [ ] Admin/Planner/Viewer login works with the correct permissions; logout works.
- [ ] Open and refresh `/hymns/ID` and `/masses/ID/edit`; JS/CSS and admin static files load without redirect loops.
- [ ] Create a fictional hymn, upload a PDF up to 10 MB, download it and compare the contents. Replace and remove it. A direct bucket URL is not public.
- [ ] Create/save/reopen/finalize a fictional Mass; selections and history survive refresh.
- [ ] Restart Render; the same account, records and PDF persist.
- [ ] Deploy another reviewed version; the same records and PDF persist.
- [ ] Pipeline mode: on the testing branch/service, verify a failing check prevents auto-deploy, then correct it and verify a passing `main` commit deploys. Record the deployed commit and URL.

**Hosting is complete only when the real URL, Supabase record/PDF persistence and one automatic deployment have been verified.** Physical phone testing is deferred to M5 and does not prevent initial desktop hosted acceptance. Do not intentionally introduce failing commits during a real Mass.

## Troubleshooting, upgrades and portability

- **Build failure:** inspect the first failing step in Render logs. Locked runtime/dependency pins must actually be available; CI checks a Linux image. Local Windows checks alone do not establish this.
- **Secret-key startup failure:** `Set DJANGO_SECRET_KEY ... at least 50 characters` means the runtime value is missing or too short. In Render Environment, add/correct the exact `DJANGO_SECRET_KEY` name using the command above, then save and redeploy. A Docker build-only placeholder is not a runtime secret. Existing Blueprint services need the dashboard correction; changing `sync: false` does not replace an existing value.
- **Database/startup failure:** confirm Session pooler/5432, password encoding, SSL and that the Supabase Free project is active. Failed migrations abort startup before Gunicorn. Do not reset the database or enable debug as a workaround.
- **Redirect loops/CSRF:** check the exact assigned hostname, proxy HTTPS setting and HTTPS origin; the frontend and API must use the same public origin.
- **PDF failure:** check the private bucket name and S3 credentials/endpoint. Storage outages return generic retryable errors; do not expose the bucket publicly.
- **Blank/stale frontend:** HTML revalidates; hashed assets cache indefinitely. Hard-refresh once after a deployment and verify the commit and asset responses. A missing asset is a 404, not the React shell.
- **Free-tier delays:** Render sleeps after 15 minutes without requests and wakes on the next request. Supabase Free can pause after a week of inactivity. Check both before testing; do not rely on these plans for uninterrupted live Mass access.
- **Paid Render upgrade:** change the Blueprint plan to the current Starter-equivalent `0.5c-512mb`, add `preDeployCommand: python manage.py migrate --noinput && python manage.py provision_roles && python manage.py seed_initial_data`, and change `RUN_STARTUP_MIGRATIONS` to `false`. The image works from `/app/backend`. For a manual service, configure these in its dashboard. Upgrade the existing service; its URL/data remain in place. Paid pre-deploy executes before switching the app version. Verify Render's current plan IDs before changing costs.
- **Supabase Pro:** upgrade the existing organization/project when no inactivity pause, daily DB backups or more capacity is needed. No provider switch is required. Database backups do not include PDF objects; maintain a separate bucket backup.
- **Bad release:** disable auto-deploy temporarily if needed, revert the bad commit locally and push the correction after review, or manually deploy a known compatible commit. Code rollback does not undo DB migrations. Use additive/backward-compatible migrations, export before destructive schema changes, and never reset hosted data as a rollback.
- **Export/migrate later:** export PostgreSQL with a compatible `pg_dump` using securely supplied connection settings and export the private bucket through Supabase's Storage tooling/S3 client. Store backup files under ignored `.local/backups`, protect them, and test restoring DB plus PDF objects into a separate destination. Preserve object keys; the DB stores those keys. Accounts use standard Django password hashes. Change `DATABASE_URL` and S3 settings to move providers; no Supabase client SDK/auth coupling has been added.
