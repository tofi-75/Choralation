# Render deployment verification — October 18, 2026

## Result

**The production image build succeeded, application startup succeeded, and Render marked Choralation Live.** Read-only checks against the public HTTPS application also passed. No new failure-repair plan is required for this deployment.

This result supersedes the failed-live-deployment status in the [earlier analysis](render-repair-report-2026-10-18.md). The successful deployment used the saved Render environment; no environment variable, credential, storage setting, compute plan, or health-check setting was changed during this deployment.

## Commit, push, and deploy

| Item | Recorded result |
| --- | --- |
| Repository | `https://github.com/tofi-75/Choralation` |
| Branch | `main` |
| Commit pushed and deployed | `8f6a2b4747e6cc53953942d4b4c94ed3b56f90e0` |
| Commit title | Document Render deployment analysis and repair plan |
| Files in that commit | Earlier analysis report and its hosting-guide link |
| Service | `Choralation`, `srv-db78nlbbc2fs73e83qi0` |
| Workspace | Toufic's workspace, `tea-cvbfi652ng1s73ed31g0` |
| Deploy | `dep-dbaiqnom7kps739128lg` |
| Trigger | Manual API trigger; auto-deploy confirmed off |
| Started | October 18, 2026, 23:34:39 Asia/Beirut |
| Finished / final status | October 18, 2026, 23:35:54 Asia/Beirut / `live` |
| URL | <https://choralation.onrender.com> |

[Deployment details](https://dashboard.render.com/web/srv-db78nlbbc2fs73e83qi0/deploys/dep-dbaiqnom7kps739128lg).

The commit contained documentation, not a runtime code fix. A fresh deployment successfully used the already-saved database configuration, as proposed by the earlier investigation. The October 13 database-scheme exception did not recur.

## Build and startup evidence

- Render checked out the exact pushed commit.
- Docker completed image export and push, then Render moved from `build_in_progress` to `update_in_progress`.
- All listed Django migrations completed, including application roles, hymns, masses, and sessions.
- Startup reported that application roles were ready and that default classifications were prepared with existing records preserved.
- Gunicorn started, bound to `0.0.0.0:10000`, and booted its worker.
- Render changed the deploy to `live` and logged that the service was available at the public URL.
- A subsequent error-level log query returned zero entries for the post-live window inspected. This is an observation for that window, not a long-term uptime claim.

## Public HTTPS verification

Reused `scripts/production-smoke.py` with its optional proxy-header injection disabled. Requests went to the real HTTPS origin; no authentication credentials or synthetic forwarded-protocol header were supplied.

| Check | Result |
| --- | --- |
| `/health/live/` | HTTP 200; `{"status":"ok"}` |
| `/health/ready/` | HTTP 200; `{"status":"ok"}`; verifies PostgreSQL readiness |
| `/login`, `/dashboard`, `/history`, `/hymns/1`, `/masses/164/edit` | HTTP 200; React shell present; HTML `Cache-Control: no-cache` |
| Referenced built JS/CSS assets | HTTP 200; non-HTML content |
| Django admin stylesheet | HTTP 200 |
| Anonymous `/api/v1/hymns/` | HTTP 403; JSON response |
| Missing API, health, asset, static, and private-media paths | HTTP 404; no React shell fallback |
| Admin route | Does not receive the React shell |

The page checks establish route/asset serving, not that the example record IDs exist or that a user can log in. The API boundary check was deliberately anonymous and read-only.

Ignored local verification artifacts are `.cache/render-deploy-2026-10-18/verify-public.py` and `public-checks.json`. An initial inline verification command had a quoting error and made no HTTP checks; it was replaced with the file-based runner, which passed.

## Remaining acceptance work

The service is now live, but these previously identified hosting requirements remain separate from build/startup success:

1. Configure complete private Supabase S3 storage before relying on persistent uploaded PDFs. The earlier environment inventory lacked these settings; this deployment did not add them. Do not rely on the Free service's local filesystem for durable uploads.
2. Configure Render's Health Check Path to `/health/ready/`. The public endpoint works, but the service setting was empty and was not changed here.
3. Provision/verify intended user accounts and test authenticated role permissions, PDF upload/download, and persistence across restart and deployment.
4. If desired, enable automatic deployment only after validating the intended CI gating. It remains off.

No user accounts, fictional hymns, or test PDFs were created by the HTTP checks. The application's normal startup did run migrations, role provisioning, and default-classification seeding against its configured database.

## Documentation follow-up

This verification report, the hosting-guide status update, and a superseding note in the original analysis are saved in a follow-up documentation commit and pushed to `main`. They do not change runtime behavior. The verified live deploy remains pinned to the commit recorded above; auto-deploy is off, so pushing the verification documentation does not trigger another deployment.
