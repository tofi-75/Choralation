# Mass Hymn Picker

A shared application for a church music team to maintain hymns and prepare Mass programs.

**Current milestone: M1 authentication preview, October 6, 2026.** Admin, Planner, and Viewer users can sign in, refresh their session, use a responsive protected workspace, and sign out. The hymn library arrives in M2. See the [development plan](DEVELOPMENT_PLAN.md) and [M1 completion report](docs/m1-report.md) for scope and verification evidence. Coordinator review remains pending.

## Run on Windows

Run in PowerShell from this project folder. Setup uses portable Python/PostgreSQL downloads and copies an existing Node 24.19+ executable from PATH. It installs dependencies from the committed locks and generates private development credentials. Downloads require network access. It installs no Windows services and changes no global configuration.

`dev.cmd` starts Windows PowerShell with an execution policy that applies only to its child process. This allows the project scripts to run when your terminal disables direct `.ps1` execution, without changing saved user/machine policy or requiring an administrator terminal. See [Microsoft's execution-policy documentation](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies).

```powershell
.\dev.cmd setup
.\dev.cmd db-start
.\dev.cmd migrate
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

## Verify M1

Stop the application servers before the browser gate; it starts/stops its own servers and rejects occupied ports. Leave PostgreSQL running.

```powershell
.\dev.cmd check
.\dev.cmd e2e
.\.local\node\node.exe .\scripts\verify-m0.mjs
```

`check` runs dependency consistency, Django system/migration checks, Python lint/format/tests, validated OpenAPI generation, TypeScript, frontend tests/lint/format, and the production frontend build. `e2e` uses real Django/PostgreSQL for all three roles at desktop/mobile sizes and removes its randomized users afterward. Existing Chrome/Edge is used when available; otherwise Chromium downloads into the project. Use a normal user terminal; restricted Windows processes can prevent Playwright from terminating its server tree.

Generated schema is `.cache/schema/openapi.yaml`; authenticated JSON schema is `/api/v1/schema/`. The M0 verifier checks specification coverage, documentation links, and planning fixtures. It does not implement recommendations.

## Environment and troubleshooting

All writable tooling stays under this project: `.local` runtimes/database/browser storage, `.venv`, `.cache`, `frontend/node_modules`, builds, and test artifacts. `.gitignore` excludes these and `.env`; [.env.example](.env.example) documents settings without secrets. Scripts configure process variables, not your profile/system PATH.

Tested versions: Python **3.14.8**, PostgreSQL **18.6**, Node **24.19.0**, npm **11.21.0**, Django **5.2.17**. Actual Node corrects M0's proposed 24.21.0; selected package engines and checks pass with 24.19.0. See [dependency decisions](docs/dependencies.md) for locks and provenance.

- If direct `.ps1` execution is disabled, use `dev.cmd`. Its temporary policy cannot override organization-managed Group Policy. If it still fails, inspect `Get-ExecutionPolicy -List`; do not change saved user/machine policy to use this project.
- If PostgreSQL fails to start, check `.local/postgres.log` and port 55432. Run `db-start` in your normal Windows user terminal; restricted processes can prevent its child process starting.
- If readiness is unavailable, start PostgreSQL and confirm `DATABASE_URL`. Then run `migrate`. SQLite is unsupported. Tests need permission to create `test_choralation`; the portable development user has it.
- Reset a forgotten password with `Invoke-Manage @('changepassword', 'your-username')` after dot-sourcing `project.ps1`.
- An interrupted browser run may leave its exact `e2e-<12-character-run-id>-<role>` accounts. Remove only those identified temporary users in Django admin; the next run uses fresh names.

## Optional Docker development

Configuration has registry-verified image digests but **has not been built or run here**, because Docker is unavailable. Portable Windows development is verified. Stop portable PostgreSQL first; Compose also uses port 55432. Docker manages storage outside the repository; use it only where that is permitted. It was not invoked under the current project-only write constraint.

With a separately available Docker host and generated `.env`:

```powershell
docker compose up -d db
docker compose run --rm backend python manage.py migrate --noinput
docker compose run --rm backend python manage.py createsuperuser
docker compose up backend
# In another terminal:
.\dev.cmd frontend
```

The Compose database bind mount `.local/docker-postgres` is separate from the portable database. `docker compose down` stops containers. The backend image defaults to Linux Gunicorn; Compose overrides it for development. Django does not serve the frontend build in production. TLS, static serving, Linux verification, deployment, and recovery rehearsal belong to M7. No deployment occurred.

## Project documentation

| Document | Purpose |
| --- | --- |
| [Original specification](mass_hymn_picker_codex_spec.md) | Authoritative requirements, preserved unchanged |
| [Development plan](DEVELOPMENT_PLAN.md) | Gradual milestones and acceptance gates |
| [Architecture](docs/architecture.md) | Permissions, session security, domain decisions |
| [API contract](docs/api.md) | Implemented auth and planned domain interfaces |
| [Dependencies](docs/dependencies.md) | Actual runtimes, resolved pins, limitations |
| [Backlog](docs/backlog.md) | Delivered and upcoming packages |
| [Code documentation](docs/code-documentation.md) | Contracts and comments to maintain |
| [Acceptance fixtures](docs/acceptance.md) | Fictional deterministic examples |
| [UX walkthrough](docs/ux-walkthrough.md) | Proposed later screens and pilot demo |
| [M0 report](docs/m0-report.md) | Engineering preparation evidence |
| [M1 report](docs/m1-report.md) | Implementation, checks, limits |

## Save progress with Git

The local repository is on `main`, without a configured remote. To change the author for future commits, replace these examples:

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
