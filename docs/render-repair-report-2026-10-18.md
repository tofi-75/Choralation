# Choralation Render deployment analysis and repair plan

**Subsequent deployment succeeded:** Commit `8f6a2b4` was pushed and deployment `dep-dbaiqnom7kps739128lg` reached Live on October 18. Public HTTPS readiness and production smoke checks passed. See the [deployment verification report](render-deployment-verification-2026-10-18.md). The analysis-phase observations below are preserved as the record before that deployment; private-storage and acceptance follow-ups remain.

**Date:** October 18, 2026 (Asia/Beirut).

**Analysis-phase result (before the subsequent deployment):** Analysis and local verification complete. The live deployment remained failed at that point; no cloud configuration change or new deploy was made during the analysis phase.

## Finding

The recorded failure is in **application startup**, after the image has reached Python execution. It is not evidence of a React compilation failure. Django rejects the runtime `DATABASE_URL` before connecting to PostgreSQL; the migration subprocess then exits with status 1, so Gunicorn never starts.

The current saved Render database value now has an accepted PostgreSQL scheme and a Supabase session-pooler endpoint. This differs from the value implied by the October 13 failure. A saved value is not proof that an earlier deployment used it, and no new deployment has tested the current value. Its authentication and network connectivity remain unverified.

Do not weaken the PostgreSQL requirement, switch to SQLite, enable debug, move real secrets into the Dockerfile, or rebuild repeatedly without checking the effective configuration. The immediate repair belongs in the service's hosted configuration, followed by a controlled deploy.

## Evidence and scope

| Item | Observation |
| --- | --- |
| Workspace displayed in Render | Toufic's workspace |
| Project/environment | `choralation` / `Production` |
| Service | `Choralation`, `srv-db78nlbbc2fs73e83qi0` |
| Public URL | <https://choralation.onrender.com> |
| Latest deploy | `dep-db78v9l9fdbs73da83n0`, failed |
| Commit | `cf55514f343fefae2bfe1c08732db88e7d6f2f7d`; local checkout also reports `cf55514` |
| Attempt timestamp | October 13, 2026, 11:08:06 PM GMT+3 |
| Deployment history | Two attempts, both failed; no successful deployment shown |
| First actionable error | `DATABASE_URL must point to PostgreSQL; SQLite is not supported.` |
| Subsequent error | `manage.py migrate --noinput` returned exit status 1 |
| Current explicit service variables | `DATABASE_URL`, `DJANGO_SECRET_KEY` |
| Environment groups | None linked; no available group was displayed |
| Saved database classification | Present; accepted PostgreSQL scheme; Supabase session pooler on 5432; no surrounding whitespace or example-placeholder markers detected |
| Docker configuration | Root directory empty; `./Dockerfile`; build context `.`; no Docker command override |
| Health Check Path | Empty; configure `/health/ready/` before accepting a deployment |
| Auto-Deploy | Off; the recorded service currently requires a manual deployment |
| Local hosted configuration | `.env.hosted` is absent; the local development `.env` points to localhost and must not be substituted |

The original failed deployment is available in the [Render dashboard](https://dashboard.render.com/web/srv-db78nlbbc2fs73e83qi0/deploys/dep-db78v9l9fdbs73da83n0). The connector's Outlook-workspace queries did not expose this project; the signed-in dashboard provided the evidence above. Credentials are not included in this report or committed files.

## Code and configuration analysis

1. `backend/config/settings.py` deliberately accepts only `postgres://` and `postgresql://`. The observed exception occurs before URL parsing or any database connection. It cannot establish that a database password is wrong, that Supabase is paused, or that a migration is broken.
2. `backend/config/deployment.py` runs migrations, role provisioning, and classification seeding in order, and stops if one fails. The failure correctly prevented the web server from starting against an unusable configuration.
3. The root Dockerfile uses disposable build-only settings for `collectstatic`. That build-only database URL is not a runtime database and must stay separate from the real Supabase value.
4. `render.yaml` declares the intended hosted settings, including private S3 storage and `/health/ready/`. A manually configured service does not automatically acquire every value merely because that file exists. For existing services, `sync: false` does not replace saved credentials.
5. The current environment has no explicit S3 settings. The application defaults to local file storage, and this Render service is Free. Even if the next deploy becomes live, that configuration does not meet the documented requirement for persistent private PDFs. Adding `DJANGO_STORAGE_BACKEND=s3` without all required credentials would instead create another startup failure.
6. Explicit debug, proxy, and migration flags should match the deployment guide for clarity. Their absence alone is not proof of failure: the application defaults to debug off, derives proxy settings from Render's hostname, and runs startup migrations by default.

## Repair plan

### 1. Establish the failing stage — completed

Read the failed deploy, its traceback, deployment history, the service's environment inventory, and its Docker settings. Compare those observations with settings, startup code, the Dockerfile, Blueprint, CI workflow, and hosting documentation.

### 2. Validate the current saved database setting — format check completed; connection pending

The saved URL now passes the scheme check that caused the recorded failure. Before deploying, confirm the intended Supabase project is active and that the URL was copied from **Connect → Session pooler**, uses port **5432**, preserves the supplied hostname and username, contains the actual URL-encoded database password, and requires TLS (`sslmode=require` or stronger). Use the provider's exact URL rather than composing a hostname. Never paste the credential into an issue, report, or Git.

The parser was also checked with a synthetic reserved-character password. That test is not an authentication test against Supabase and does not prove that the real credential works.

### 3. Verify relevant application behavior locally — completed

Run the existing hosting and setup tests, Django system and migration-drift checks, and production frontend build. Results are recorded below. No application-code change was justified by the reproduced evidence.

### 4. Complete the hosted configuration — pending private provider settings

Apply the following to the **existing Choralation service**, preserving unrelated variables and the existing valid Django secret. Do not create another Render service, database, disk, or paid plan as a workaround.

| Setting | Required action |
| --- | --- |
| `DATABASE_URL` | Confirm the current saved Supabase session-pooler credential; correct it privately only if required |
| `DJANGO_SECRET_KEY` | Retain the existing stable secret; confirm it has at least 50 characters; do not rotate it just to redeploy |
| `DJANGO_STORAGE_BACKEND` | Set `s3` only when the complete S3 settings below are ready |
| `AWS_STORAGE_BUCKET_NAME` | `sheet-music`, with the bucket private in Supabase |
| `AWS_S3_ENDPOINT_URL` | Exact HTTPS endpoint from Supabase Storage |
| `AWS_S3_REGION_NAME` | Exact region from the same provider settings |
| `AWS_ACCESS_KEY_ID` | Private S3 access key from the intended Supabase project |
| `AWS_SECRET_ACCESS_KEY` | Matching private S3 secret |
| `DJANGO_DEBUG` | `false` |
| `DJANGO_TRUST_PROXY_HTTPS` | `true` |
| `RUN_STARTUP_MIGRATIONS` | `true` for this Free service |
| `APP_TIME_ZONE` | `Asia/Beirut` |
| `ALLOW_HOSTED_DEMO_DATA` | Leave disabled for ordinary use; enable only for an intentional fictional-data test |
| Health Check Path | `/health/ready/` |

The missing private storage settings are not available in a local `.env.hosted` file. They must come from the intended provider project. Supply them directly in Render; do not send their values in chat. Keep Dashboard settings as the source of truth for this existing service until a deliberate Blueprint migration is chosen.

### 5. Deploy once with the completed configuration — pending

After saving the complete set, deploy the reviewed commit. An environment-only repair can use Render's **Save and deploy** option to redeploy the existing build; a source change requires a normal build/deploy. **Save only** does not activate the values. A plain **Restart service** reuses the running version's environment and is not the appropriate way to apply newly saved settings.

Record the new deploy ID and exact commit. Confirm that Django settings load, migrations/provisioning/default seeding complete, Gunicorn binds to Render's port, and the deployment reaches **Live**. If it fails, diagnose the first new error before retrying. Do not treat the older traceback as the new result.

### 6. Accept the hosted result — pending

- [ ] `/health/live/` responds successfully.
- [ ] `/health/ready/` returns HTTP 200 and `{"status":"ok"}` over the public HTTPS URL.
- [ ] `/login`, JavaScript/CSS, admin static files, and refreshed application routes load.
- [ ] Authenticated login/CSRF and role permissions work; anonymous APIs and private PDF downloads are denied.
- [ ] Upload/download a clearly identified test PDF; the direct object remains private.
- [ ] Existing records and that PDF survive a restart and subsequent deploy.
- [ ] Record the successful deploy ID/commit and inspect logs for new runtime errors.

Readiness verifies the database, not S3 storage. A passing readiness check does not replace the PDF acceptance test. Enabling automatic deployment after CI checks pass is a separate follow-up once the first deployment is accepted; do not change the pipeline merely to investigate this incident.

## Verification performed

| Check | Result and limits |
| --- | --- |
| Existing `tests/test_hosting.py` + `tests/test_setup.py` | **40 passed**; isolated local PostgreSQL test database |
| Django `check` | Passed: no issues |
| `makemigrations --check --dry-run` | Passed: no changes detected |
| Frontend `npm run build` | Passed: TypeScript and Vite production build; existing >500 kB chunk warning remains non-fatal |
| Synthetic database URL parsing | Passed; confirms parser behavior only, no real hosted credential used |
| Real Supabase connectivity | Not tested |
| Live Render deploy/readiness/PDF persistence | Not tested during this investigation |
| Full Linux Docker build | Not rerun; Docker executable was unavailable on the inspected command path |

The first local test attempt hit environment setup problems: localhost access was denied in the sandbox, its started PostgreSQL process did not persist, and the chosen pytest temporary parent was missing. The final run created its artifact parent, ran with the required local-process access, used a uniquely named disposable test database, passed all 40 tests, and stopped the PostgreSQL server afterward. These initial setup errors are not evidence of the hosted application defect.

Final test evidence: `.cache/render-repair-2026-10-18/ba6db05328f94cf2a6a0042484e83e0c/hosting-tests.xml`. Generated caches and frontend build output are ignored artifacts.

## Work log and final status

- Rechecked the dashboard: the same October 13 deploy is still the latest failed attempt.
- Read the startup traceback and compared the deployed commit with the local checkout.
- Inspected the environment inventory; classified the database value without including it in this report.
- Identified that the current saved database format differs from the recorded failing runtime state.
- Identified missing private storage configuration and reviewed the intended hosting contract.
- Inspected Docker source/path/context settings and the existing CI smoke-check design.
- Retrieved current Render environment/deployment/health-check documentation and Supabase connection guidance.
- Ran and recorded the focused verification above.
- Added this report and linked it from the hosting guide. No application source, Dockerfile, Blueprint, cloud configuration, credential, or deployment was changed. No commit or push was made.

**Remaining dependency:** complete the private hosted configuration, then execute and verify a new deployment. This report completes the requested analysis and plan; it does not claim that the live deployment has been repaired.

## References

- [Render environment save/deploy behavior](https://render.com/docs/configure-environment-variables)
- [Render deployment stages, restart behavior, and current live deploy](https://render.com/docs/deploys)
- [Render HTTP readiness checks](https://render.com/docs/health-checks)
- [Supabase connection methods, session-pooler URLs, and password encoding](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Project hosting guide](hosting.md) and [earlier hosting preparation report](hosting-report.md)
