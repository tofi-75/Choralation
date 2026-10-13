# Hosting preparation verification

**October 13, 2026. Status: hosting preparation implemented and locally verified; live deployment pending manual owner setup.**

The owner requested that all account creation, login, provider settings, publishing and live verification be left as notes for manual completion later. No Git staging, commit, push, cloud resource creation or account access is included in preparation.

## Delivered configuration

- Single-origin production React/Django Docker build and Gunicorn startup, bounded PostgreSQL connections and proxy HTTPS.
- Private Supabase S3 storage with authenticated existing PDF APIs; local storage remains the development default.
- Render free Frankfurt Blueprint on main, auto-deploy after checks pass, readiness checks and startup migrations.
- Project-local hosted administration with explicit target confirmation, hidden password prompts and doubly opted-in fictional seeding.
- GitHub Actions with isolated DBs, application/browser checks and Linux production Docker smoke checks.
- [Manual and pipeline deployment instructions](hosting.md), paid upgrades, rollback and DB/PDF portability.

## Local verification

- Backend: full regression suite passed 226 tests. After adding the internal readiness regression and final environment/admin refinements, the focused hosting/setup run passed 37 tests, including all 29 hosting tests. This verifies 227 distinct backend tests across the full and focused runs.
- Frontend: 62 unit tests passed; type checking, lint, formatting and optimized Vite production build passed. The existing shared-bundle size warning is unchanged and does not fail the build.
- Browser: the full four-viewport run passed 72 of 76 scenarios. The four failures were a shared fixture-prefix collision between two picker scenarios, not an application filter failure. The picker-control scenario now uses its own unique prefix; its rerun passed on desktop, 390, 360 and 430 px (4/4). All 76 scenarios are verified across these runs. The two disposable browser databases and run-owned accounts were removed; manual local records were preserved.
- Production serving: built React assets and Django WSGI passed two actual local HTTP smoke cycles with proxy HTTPS headers, including page refreshes, admin assets, unauthenticated API denial and reserved/missing paths. Secure session/CSRF login, PDF permission/persistence and non-redirecting failed readiness have focused regression coverage. This is not a real public HTTPS or Supabase persistence test.
- Configuration: Render Blueprint validates against Render's official JSON Schema. Node's production-build image and the existing Python image were verified through Docker Hub for amd64; both images are pinned by digest. Python dependency closure installation and pip compatibility checks passed. Ruff, schema validation, migration drift check and Django system checks passed.
- Docker is unavailable on the inspected local command path. Linux image build/Gunicorn startup and a container restart smoke run are configured in GitHub Actions and remain unexecuted until the owner publishes the repository. GitHub/Render integration and actual Supabase S3 behavior are not claimed as locally verified.

Artifacts are project-local: `.cache/hosting-full-checks` (schema/Blueprint evidence and backend runs), `.cache/hosting-tests-final` (focused runs), and `frontend/test-results` (latest picker screenshots/traces). Source and docs remain uncommitted. No staging, push, account login, provider setup, firewall change or clock adjustment occurred.

## Live acceptance

Public URL: pending. Supabase DB/PDF persistence: pending. Failed-check blocking and subsequent successful automatic deployment: pending. Physical-phone acceptance: M5. All pending manual steps are listed in the deployment guide.
