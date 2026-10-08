# Mass Hymn Picker

A shared application for a church music team to maintain hymns and prepare Mass programs.

**Delivered: M3 persistent draft planning, including October 8 reviews. M4 is next and authorized to start.** Your team can maintain the hymn library and prepare saved Mass programs with multiple hymns, ordering, notes, recoverable autosave, and revision conflict review. Viewer access is read-only; Admins can confirm draft deletion. See the [development plan](DEVELOPMENT_PLAN.md) and [M3 report](docs/m3-report.md) for scope and verification evidence. Coordinator walkthrough and physical-phone acceptance remain pending and are required by the M4 gate.

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

`seed` creates **45 defaults**: 7 genres, 14 seasons (original choices plus seven Maronite additions), 11 placements, 4 languages, and 9 tags. It creates no hymns or passwords and preserves existing labels, order, and active state. Deactivate unwanted defaults instead of deleting them: explicitly rerunning the seed recreates deleted defaults. Categories are maintained through the secured API or Django admin now; the full React Settings interface arrives in M6. Django admin additionally requires staff status and model permissions; an application Admin group alone does not grant that access.

An optional development-only command adds **36 fictional demo hymns** covering active categories/tags, with varied durations and some polyphonic examples. It supplies no real lyrics, audio/PDF files, Masses or usage history. In a temporary project PowerShell terminal (`powershell.exe -NoProfile -ExecutionPolicy Bypass`), run:

```powershell
. .\scripts\project.ps1
Invoke-Manage @('seed_demo_data', '--username', 'your-existing-editor')
```

The named account must be an existing Admin or Planner. Existing matching demo hymns and user data are preserved on replay. The October 8 review requested this data in the local development database. Finalization and usage arrive in M4.

## Prepare draft Mass programs

When upgrading, run `migrate` with PostgreSQL running, then restart the backend. Open **Mass plans**, choose **Create Mass**, enter the date/details, then choose **Next** to open the editor. The default date is the nearest Sunday in Beirut; changing the date suggests its Maronite season. You can override or clear the season. Existing saved plans keep their season until you change the date or select another season. [Calendar notes](docs/calendar.md) explain the public Evangelizo API, local fallback and future Settings editor. Expand **Title and notes (optional)** to customize the title or add notes; a blank title generates a date-based title. On the saved planner, these fields are under **Title and Mass notes**. Search plans directly, or expand **Filter by date or season**; **Clear filters** restores the full list.

The list shows **Today and upcoming** Masses nearest date first, followed by **Archived** past Masses, most recent first. The team timezone determines today. Archived is a date-based grouping: past drafts still open normally and remain editable by planners. Ordering applies across all pages and filters.

Choose **+** beside a placement to see its active hymns. Hymns for the selected season and season-neutral hymns appear first, followed by other-season choices. This preference applies before pagination and keeps title/newest ordering within each group. The picker scrolls independently on phones. Expand **Filters and sort** for language/genre filters, secondary ordering, or an explicit **Search all placements** override. If a hymn is repeated or differently classified, **Add anyway** acknowledges the focused warning; **Cancel choice** returns to search. Left-hand arrows reorder hymns within their placement. The pencil opens selection notes and **Change hymn** (preserving notes/order); **Edit library details** edits the shared hymn. The bin removes that selection from the Mass, preserving the hymn in the library. Empty placements remain optional. Changes autosave after a short pause. Failed saves retain the working copy and offer retry. Inactive saved selections remain visible and can retain notes/order, but cannot be newly added.

When finished planning, choose **Save draft**. It waits for pending autosave and opens a compact read-only program. Mass list links open this view too; **Edit** returns to the draft editor. Selection notes and Mass notes remain visible. Empty active sections stay visible in their configured order and show **Hymn not selected**. Viewers have no Edit action. Saving retains draft status; finalization/history remains M4. [Picker and saved-view notes](docs/m3-picker-view-review.md) explain behavior and verification.

If another planner saves first, **Review saved version** shows the server program while preserving yours. Explicitly discard/reload to resume from the latest revision; there is no silent overwrite or automatic merge. Edits are held in memory until saved, so this is not offline storage. Navigation and sign-out warn about unconfirmed changes. Admins can confirm deletion of a saved draft. Django admin permits read-only Mass/selection inspection. Finalization/history remain M4; recommendations remain M5.

On a draft Mass, **Random hymns** fills empty active placements with one active hymn each, matching the selected season or season-neutral classification. It preserves existing choices and notes, avoids repeats, and reports any placements without an unused match. Select a season first; manual additions remain available with **+**. Random choices use the same autosave/retry/conflict handling as manual choices. Remove a choice and pick again to try another eligible hymn. See [picker implementation and checks](docs/random-picker.md).

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
| [API contract](docs/api.md) | Implemented auth/library/draft Mass contracts and planned lifecycle/usage interfaces |
| [Dependencies](docs/dependencies.md) | Actual runtimes, resolved pins, limitations |
| [Backlog](docs/backlog.md) | Delivered and upcoming packages |
| [Code documentation](docs/code-documentation.md) | Contracts and comments to maintain |
| [Acceptance fixtures](docs/acceptance.md) | Fictional deterministic examples |
| [UX walkthrough](docs/ux-walkthrough.md) | Proposed later screens and pilot demo |
| [M0 report](docs/m0-report.md) | Engineering preparation evidence |
| [M1 report](docs/m1-report.md) | Implementation, checks, limits |
| [M2 report](docs/m2-report.md) | Library delivery, acceptance evidence, remaining scope |
| [M3 report](docs/m3-report.md) | Draft planning, autosave/concurrency evidence, remaining scope |
| [M3 UI review](docs/m3-ui-review.md) | Compact planner, icon actions, Maronite calendar and 36 demo hymns |
| [Calendar](docs/calendar.md) | Public API, fallback boundaries, manual overrides and future Settings |

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
