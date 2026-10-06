# Mass Hymn Picker

A shared application for a church music team to maintain hymns and prepare Mass programs.

**Current milestone: M2 useful hymn library, October 6, 2026.** Your team can add, edit, classify, search, and filter saved hymns. Viewer access is read-only; Admins can deactivate, reactivate, and delete hymns safely. See the [development plan](DEVELOPMENT_PLAN.md) and [M2 completion report](docs/m2-report.md) for scope and verification evidence. Coordinator review remains pending.

The [M1 review](docs/m1-review.md) adds private PDF sheet music, polyphony with named voices, numeric duration, and a more compact interface designed primarily for phones.

## Run on Windows

Run in PowerShell from this project folder. Setup uses portable Python/PostgreSQL downloads and copies an existing Node 24.19+ executable from PATH. It installs dependencies from the committed locks and generates private development credentials. Downloads require network access. It installs no Windows services and changes no global configuration.

`dev.cmd` starts Windows PowerShell with an execution policy that applies only to its child process. This allows the project scripts to run when your terminal disables direct `.ps1` execution, without changing saved user/machine policy or requiring an administrator terminal. See [Microsoft's execution-policy documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies).

```powershell
.\dev.cmd setup
.\dev.cmd db-start
.\dev.cmd migrate
.\dev.cmd seed
.\dev.cmd admin
```

The final command prompts for your first administrator's username, optional email, and password. Password input is hidden; Django validates and hashes it. Remember these credentials for both the React app and Django admin. Run `admin` to create a new account; existing accounts are preserved.

Keep these servers running in two project terminals:

```powershell
# Terminal 1
.\dev.cmd backend
```

```powershell
# Terminal 2
.\dev.cmd frontend
```

Open [the app](http://127.0.0.1:5173) and sign in. Django admin is at [the backend admin route](http://127.0.0.1:8000/admin/). Use the same hostname consistently; localhost and 127.0.0.1 have separate cookie storage. Stop each server with Ctrl+C; stop PostgreSQL with `.\dev.cmd db-stop`.

Ports are PostgreSQL **55432**, Django **8000**, and Vite **5173**, bound locally. Vite proxies `/api` to Django. PostgreSQL data lives in `.local/pgdata`; keep it to retain users/sessions between restarts. Setup and migration can be rerun without resetting the database or replacing `.env`.

## Use the hymn library

If upgrading from M1, leave PostgreSQL running, run `migrate` then `seed`, and restart the backend to load the new routes (the launcher disables automatic reload). This project's development database already has the M2 migration and category defaults.

For the review upgrade, run `migrate` and restart the backend. The additive `0002_sheet_music_and_polyphony` migration has already been applied to this project's database and preserves existing hymns.

Open **Hymn library** after signing in. Admins and Planners can add a hymn with its title, language, and at least one placement. Choose a season or mark it season-neutral. The form supports every optional metadata field, multiple classifications, and Arabic/Syriac text. Failed saves retain your input; saved details survive refresh.

Tap a classification summary to search/select choices; tags stay compact even with many selections. Expand **More hymn details** for optional metadata. **Duration (minutes)** accepts positive decimal numbers. Enable **Polyphony** and use **Add voice** for named parts; turning it off asks before removing names. Phone forms keep Save/Cancel available while scrolling.

Use **Sheet music PDF** to attach a PDF up to 10 MB, and download the saved attachment from hymn detail. Admins/Planners can replace or remove it; Viewers can download it. Native uploads live in ignored `.local/media`; `DJANGO_MEDIA_ROOT` can override this private storage path. Docker storage is described below. Downloads require authentication. Back up upload storage alongside PostgreSQL to retain sheet music; PDFs are not stored in Git or inside the database. The existing sheet-music URL remains available.

Search and combine classification filters. Filters persist in the URL for refresh, sharing, and browser history. Seasons match saved season links literally: an Easter filter does not include a neutral-only hymn. Library sorting currently supports title and newest added. Admin actions on hymn detail require confirmation; inactive hymns remain searchable using the active-status filter.

`seed` creates **38 defaults**: 7 genres, 7 seasons, 11 placements, 4 languages, and 9 tags. It creates no hymns or passwords and preserves existing labels, order, and active state. Deactivate unwanted defaults instead of deleting them: explicitly rerunning the seed recreates deleted defaults. Categories are maintained through the secured API or Django admin now; the full React Settings interface arrives in M6. Django admin additionally requires staff status and model permissions; an application Admin group alone does not grant that access.

An optional development-only command adds three clearly fictional hymns without real lyrics or usage history. In a temporary project PowerShell terminal (`powershell.exe -NoProfile -ExecutionPolicy Bypass`), run:

```powershell
. .\scripts\project.ps1
Invoke-Manage @('seed_demo_data', '--username', 'your-existing-editor')
```

The named account must be an existing Admin or Planner. Existing matching demo hymns are preserved. No demo hymns were added to the development database during M2 delivery. Draft Mass planning comes in M3; finalization and usage in M4.

## Provision team access

The role migration creates Admin, Planner, and Viewer groups. Superusers have application Admin access. Other users get the highest assigned role; ungrouped users are Viewers. Staff status alone does not grant application Admin. Group Admin does not automatically grant Django admin access.

Use the first superuser's protected Django admin to create users and assign groups, or run password-prompt commands:

```powershell
# Dot-sourcing loads project-local tools in this terminal only.
. .\scripts\project.ps1
Invoke-Manage @('create_app_user', 'planner', '--role', 'Planner')
Invoke-Manage @('create_app_user', 'viewer', '--role', 'Viewer')
```

If direct scripts are disabled, open a temporary project terminal using `powershell.exe -NoProfile -ExecutionPolicy Bypass` before dot-sourcing. Closing it ends the temporary policy. These commands reject existing usernames. For automation, `--password-env VARIABLE_NAME` reads a process-scoped secret instead of accepting a password argument. `.\dev.cmd roles` recreates missing groups without changing memberships. There is no public registration or committed default password.

## Verify the application

Leave PostgreSQL running. The browser gate starts/stops its own servers on **8001/5174**, separate from normal development ports, and rejects occupied test ports.

```powershell
.\dev.cmd check
.\dev.cmd e2e
.\.local\node\node.exe .\scripts\verify-m0.mjs
```

`check` runs dependency consistency, Django system/migration checks, Python lint/format/tests, validated OpenAPI generation, TypeScript, frontend tests/lint/format, and the production frontend build. Each run gets a fresh project-local temporary directory. `e2e` uses real Django/PostgreSQL for authentication/library/review flows for all three roles at desktop and phone widths 360/390/430 px, then removes its randomized users, test hymns, and uploaded PDFs. Existing Chrome/Edge is used when available; otherwise Chromium downloads into the project. Use a normal user terminal; restricted Windows processes can prevent Playwright from terminating its server tree.

Generated schema is `.cache/schema/openapi.yaml`; authenticated JSON schema is `/api/v1/schema/`. The M0 verifier checks specification coverage, documentation links, and planning fixtures. It does not implement recommendations.

## Environment and troubleshooting

All writable tooling stays under this project: `.local` runtimes/database/browser storage, `.venv`, `.cache`, `frontend/node_modules`, builds, and test artifacts. `.gitignore` excludes these and `.env`; [.env.example](.env.example) documents settings without secrets. Scripts configure process variables, not your profile/system PATH.

Tested versions: Python **3.14.8**, PostgreSQL **18.6**, Node **24.19.0**, npm **11.21.0**, Django **5.2.17**. Actual Node corrects M0's proposed 24.21.0; selected package engines and checks pass with 24.19.0. See [dependency decisions](docs/dependencies.md) for locks and provenance.

- If direct `.ps1` execution is disabled, use `dev.cmd`. Its temporary policy cannot override organization-managed Group Policy. If it still fails, inspect `Get-ExecutionPolicy -List`; do not change saved user/machine policy to use this project.
- If PostgreSQL fails to start, check `.local/postgres.log` and port 55432. Run `db-start` in your normal Windows user terminal; restricted processes can prevent its child process starting.
- If readiness is unavailable, start PostgreSQL and confirm `DATABASE_URL`. Then run `migrate`. SQLite is unsupported. Tests need permission to create `test_choralation`; the portable development user has it.
- Reset a forgotten password with `Invoke-Manage @('changepassword', 'your-username')` after dot-sourcing `project.ps1`.
- An interrupted browser run may leave its exact `e2e-<12-character-run-id>-<role>` accounts and attributed hymns. Remove only those identified test records in Django admin; the next run uses fresh names.

## Optional Docker development

Configuration has registry-verified image digests but **has not been built or run here**, because Docker is unavailable. Portable Windows development is verified. Stop portable PostgreSQL first; Compose also uses port 55432. Docker manages storage outside the repository; use it only where that is permitted. It was not invoked under the current project-only write constraint.

With a separately available Docker host and generated `.env`:

```powershell
docker compose up -d db
docker compose run --rm backend python manage.py migrate --noinput
docker compose run --rm backend python manage.py seed_initial_data
docker compose run --rm backend python manage.py createsuperuser
docker compose up backend
# In another terminal:
.\dev.cmd frontend
```

The Compose database bind mount `.local/docker-postgres` is separate from the portable database. `docker compose down` stops containers. The backend image defaults to Linux Gunicorn; Compose overrides it for development. Django does not serve the frontend build in production. TLS, static serving, Linux verification, deployment, and recovery rehearsal belong to M7. No deployment occurred.

Compose stores private PDFs in the `backend-media` named volume mounted at `/app/media`. The image creates that directory with ownership for `appuser`; a new named volume inherits its permissions. Uploads survive container recreation and `docker compose down`. Back up this volume alongside the database; `docker compose down -v` deletes it. When running the image outside Compose, mount persistent storage at `/app/media` and ensure it is writable by UID 10001. An existing mount must have suitable ownership; the image cannot change a mounted directory's permissions at runtime.

## Project documentation

| Document | Purpose |
| --- | --- |
| [Original specification](mass_hymn_picker_codex_spec.md) | Authoritative requirements, preserved unchanged |
| [Development plan](DEVELOPMENT_PLAN.md) | Gradual milestones and acceptance gates |
| [Architecture](docs/architecture.md) | Permissions, session security, domain decisions |
| [API contract](docs/api.md) | Implemented auth/library and planned Mass/usage interfaces |
| [Dependencies](docs/dependencies.md) | Actual runtimes, resolved pins, limitations |
| [Backlog](docs/backlog.md) | Delivered and upcoming packages |
| [Code documentation](docs/code-documentation.md) | Contracts and comments to maintain |
| [Acceptance fixtures](docs/acceptance.md) | Fictional deterministic examples |
| [UX walkthrough](docs/ux-walkthrough.md) | Proposed later screens and pilot demo |
| [M0 report](docs/m0-report.md) | Engineering preparation evidence |
| [M1 report](docs/m1-report.md) | Implementation, checks, limits |
| [M2 report](docs/m2-report.md) | Library delivery, acceptance evidence, remaining scope |

## Save progress with Git

The local repository is on `main`, without a configured remote. Changes are left uncommitted unless you explicitly request a commit. To change the author for future commits and save progress yourself, replace these examples:

```powershell
git config --local user.name "Your Name"
git config --local user.email "you@example.com"
git status
git diff
git add path/to/changed-file
git diff --cached
git commit -m "Describe the completed change"
git log --oneline -5
```

Commit locks and migrations. Keep secrets, databases, runtimes, and generated files ignored. Author configuration affects future commits; amend an existing commit only deliberately after reviewing its sharing status.
