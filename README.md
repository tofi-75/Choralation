# Choralation

> **Local implementation, November 21:** [Choir roles, Mass reading and lossless PDFs](docs/roles-reader-pdf-update.md) describes the current checkout and staged rollout. These changes are not part of the live `91a8c56` release.

A shared application for church music teams to maintain hymns and prepare Mass programs.

**Current release, reviewed November 20, 2026.** Commit `91a8c56` is live at [Choralation](https://choralation.onrender.com). Draft planning, finalization/history, choir membership, Manager requests, Admin classifications, choir calendar settings, private hymn submissions, and Mass Focus are shipped. Physical-phone and coordinator acceptance remain pending. See [current status](docs/current-status.md) and the [compact handoff](docs/chat-handoff.md).

New users can register and sign in with a password. Email verification and emailed recovery are disabled. Recovery is owner-assisted through tofi.lattouf@gmail.com. [Account setup and permissions](docs/accounts-and-choirs.md) describe Choirmaster access and choir membership.

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

For same-Wi-Fi physical-phone testing, use the separate [phone launch and acceptance checklist](docs/phone-testing.md). It builds optimized assets for phone loading and enables frontend LAN access with process-only host/CSRF settings; backend and database remain local. Real-device results remain pending until recorded.

## Use the hymn library

If upgrading from M1, leave PostgreSQL running, run `migrate` then `seed`, and restart the backend to load the new routes (the launcher disables automatic reload). Check migration state on each checkout before testing.

For the review upgrade, run `migrate` and restart the backend. The migration sequence preserves existing hymns and also includes account, choir, moderation, and season changes.

Open **Hymns** after signing in. Members can create private hymns for planner review. Admins and choir Leaders/Planners can add a shared hymn with its title, language, and at least one placement. Choose a season or mark it season-neutral. The form supports every optional metadata field, multiple classifications, and Arabic/Syriac text. Failed saves retain your input; saved details survive refresh.

Tap a classification summary to search/select choices; tags stay compact even with many selections. Expand **More hymn details** for optional metadata. **Duration (minutes)** accepts positive decimal numbers. Enable **Polyphony** and use **Add voice** for named parts; turning it off asks before removing names. Phone forms keep Save/Cancel available while scrolling.

Use **Sheet music PDF** to attach a PDF up to 10 MB, and download the saved attachment from hymn detail. Admins and choir Leaders/Planners can replace or remove shared PDFs; Users can download published PDFs and manage their own private attachments. Native uploads live in ignored `.local/media`; `DJANGO_MEDIA_ROOT` can override this private storage path. Docker storage is described below. Downloads require authentication. Back up upload storage alongside PostgreSQL to retain sheet music; PDFs are not stored in Git or inside the database. The existing sheet-music URL remains available.

Search and combine classification filters. Filters persist in the URL for refresh, sharing, and browser history. Seasons match saved season links literally: a Resurrection filter does not include a neutral-only hymn. Library sorting supports title, newest added, recently/least recently used, and most/least used. Usage counts finalized selection occurrences; duplicates count separately. Never-used hymns show **Never used**. Future finalized dates show **Scheduled for** with the exact date. Expand filters for inclusive used-after/before dates, not-used-since, and never-used choices; combined used-after/before bounds must match the same occurrence. Admin actions on hymn detail require confirmation; inactive hymns remain searchable using the active-status filter.

`seed` creates **39 defaults**: 7 genres, 8 seasons, 11 placements, 4 languages, and 9 tags. It creates no hymns or passwords and preserves existing labels, order, and active state. Deactivate unwanted defaults instead of deleting them: explicitly rerunning the seed recreates deleted defaults. Admins manage all five category types in **Settings**, including reorder, impact checks and safe deactivation. Choir planners manage **Choirs → Choir calendar**; members can read those defaults. Django admin additionally requires staff status and model permissions; an application Admin group alone does not grant that access.

An optional development-only command adds **36 fictional demo hymns** covering active categories/tags, with varied durations and some polyphonic examples. It supplies no real lyrics, audio/PDF files, Masses or usage history. In a temporary project PowerShell terminal (`powershell.exe -NoProfile -ExecutionPolicy Bypass`), run:

```powershell
. .\scripts\project.ps1
Invoke-Manage @('seed_demo_data', '--username', 'your-existing-editor')
```

The named account must be an existing Admin or Planner. Existing matching demo hymns and user data are preserved on replay. The October 8 review requested this data in the local development database. M4 now derives usage from finalized Mass selections; demo seeding still creates no usage history.

## Prepare draft Mass programs

When upgrading, run `migrate` with PostgreSQL running, then restart the backend. Open **Mass plans**, choose **New Mass** to open the separate details page, enter the date/details, then choose **Next** to open the hymn/order step. If another Mass already exists on that date, confirm before creating another. The default date is the nearest Sunday in the selected choir's timezone (Beirut by default); changing the date suggests its Maronite season. You can override or clear the season. Existing saved plans keep their season until you change the date or select another season. [Calendar notes](docs/calendar.md) explain the public Evangelizo API, local fallback and choir calendar settings. Expand **Title and notes (optional)** to customize the title or add notes; a blank title generates a date-based title. The hymn step shows confirmed details read-only; **Back to Mass details** lets you change them without losing selections. Title/notes are under **Title and Mass notes**. Each placement’s **+** opens a compact inline hymn picker with search, filters and metadata. The Mass list opens on **Saved Masses** (today/upcoming finalized programs); choose **Drafts** for saved drafts awaiting finalization. Use the compact title/notes search and adjacent **Filters** icon for dates or season. **New Mass** stays on the right. On phones, the From, To and Season controls stack at equal widths. **Clear filters** keeps the selected list.

In a saved Mass, tap anywhere on a hymn row to open Focus at that selection. Hold for 500 ms (or rightclick/Shift+F10) for **Go to hymn**, which opens hymn details with **Back to Mass**. Closing Focus restores the initiating row and scroll position. In **Focus mode**, tap the title or chevron to choose another hymn. The title, musical details and close icon share one header. Header titles use a consistent size and single-line ellipsis. Reloading the same Mass history entry restores Focus at the first hymn. Exit Focus to clear this restoration. Swipe up or down to turn PDF or lyric pages. For oversized PDFs, pan to the edge first. A long downward swipe from the top of the current page closes the active reader. Use **−** or **+** at the top of the lyrics to change text size.

The saved list shows **Today and upcoming** Masses nearest date first. **Archived Masses** opens past finalized programs, most recent first, with expandable complete hymn lists. The team timezone determines today. Archived is a date-based grouping: past drafts still open normally and remain editable by planners. Ordering applies across all pages and filters.

Choose **+** beside a placement to see its active hymns. Hymns for the selected season, Ordinary Time and season-neutral hymns appear first, followed by other-season choices. This preference applies before pagination and keeps title/newest ordering within each group. The picker scrolls independently on phones. Expand **Filters and sort** for language/genre filters, secondary ordering, or an explicit **Search all placements** override. If a hymn is repeated or differently classified, **Add anyway** acknowledges the focused warning; **Cancel choice** returns to search. A drag grip appears for sections with multiple hymns and supports pointer, touch and keyboard reordering. The pencil opens selection notes and **Change hymn** (preserving notes/order); **Edit library details** edits the shared hymn. The bin removes that selection from the Mass, preserving the hymn in the library. Empty placements remain optional. Changes autosave after a short pause. Failed saves retain the working copy and offer retry. Inactive saved selections remain visible and can retain notes/order, but cannot be newly added.

Drafts open directly in edit mode for planners and autosave as you work. **Save Mass** waits for pending writes and finalizes the program. Finalized list links open the read-only program. Selection and Mass notes remain visible, and empty active sections show **Hymn not selected**. Members can read accessible programs.

If another planner saves first, **Review saved version** shows the server program while preserving yours. Explicitly discard/reload to resume from the latest revision; there is no silent overwrite or automatic merge. Edits are held in memory until saved, so this is not offline storage. Navigation and sign-out warn about unconfirmed changes. Admins can confirm deletion of a saved draft. Django admin permits read-only Mass/selection inspection. M4 finalization/history is described below; recommendations remain deferred.

On a draft Mass, the **Random hymns** shuffle icon below the sections fills empty active placements with one active hymn each, matching the selected season, Ordinary Time or season-neutral classification. It preserves existing choices and notes, avoids repeats, and reports any placements without an unused match. Select a season first; manual additions remain available with **+**. Random choices use the same autosave/retry/conflict handling as manual choices. Remove a choice and pick again to try another eligible hymn. See [picker implementation and checks](docs/random-picker.md).

## Finalize and review history — M4

Finish editing with **Save Mass** to finalize and open the saved program. Finalization adds each selection to choir usage counts and makes the program read-only. Empty placements/programs remain allowed; advisory program notes stay on the page. Edits in another tab produce a conflict: check the refreshed program and acknowledge it before another attempt. Failed requests allow retry. See [the details and finalization refinement](docs/planning-refinement.md).

Choir Leaders, Planners and Admins can choose the **Edit** pen on a finalized Mass and confirm. This returns it to a draft and removes the program from hymn usage until it is finalized again, preserving all selection IDs, order and notes. Choir Leaders and Admins see the **Delete** bin; confirmation permanently removes the Mass and selections, retaining hymns. Members cannot finalize, edit or delete Masses. Current-state repeats are no-ops; stale revision requests still conflict.

**Mass history** lists finalized programs newest first, with date/season/status and title/notes filters, selection totals and a short program preview. Status filters can include drafts, which never count toward hymn usage. Hymn detail shows each finalized occurrence with its Mass, placement, order and notes, including inactive retained sections. Repeated hymn selections appear separately. Lifecycle changes refresh library/detail/history caches without requiring a full reload.

The [current status](docs/current-status.md) records shipped work. The [phone checklist](docs/phone-testing.md) tracks real-device acceptance, which remains pending.

## Provision team access

The role migration creates Admin, Choirmaster, and User groups. Superusers/Admin group members have application Admin access. Global Choirmaster follows approved choir creation permission; all other accounts are Users. Scoped Leader/Planner/Member assignments control each choir. Staff status alone does not grant application Admin. Group Admin does not automatically grant Django admin access.

Use the first superuser's protected Django admin to create users and assign groups, or run password-prompt commands:

```powershell
# Dot-sourcing loads project-local tools in this terminal only.
. .\scripts\project.ps1
Invoke-Manage @('create_app_user', 'planner', '--role', 'Choirmaster')
Invoke-Manage @('create_app_user', 'viewer', '--role', 'User')
```

If direct scripts are disabled, open a temporary project terminal using `powershell.exe -NoProfile -ExecutionPolicy Bypass` before dot-sourcing. Closing it ends the temporary policy. These commands reject existing usernames. For automation, `--password-env VARIABLE_NAME` reads a process-scoped secret instead of accepting a password argument. `.\dev.cmd roles` recreates missing groups without changing memberships. Self-registration is available in simple-account mode. No default password is committed.

## Verify the application

Leave PostgreSQL running. The browser gate starts/stops its own servers on **8001/5174**, separate from normal development ports, and rejects occupied test ports.

```powershell
.\dev.cmd check
.\dev.cmd e2e
.\.local\node\node.exe .\scripts\verify-m0.mjs
```

`check` runs dependency consistency, Django system/migration checks, Python lint/format/tests, validated OpenAPI generation, frontend tests/lint/format, browser-coverage guard checks, and the production frontend build (including TypeScript). Each run gets a fresh project-local temporary directory. Frontend unit tests use two isolated VM workers. `e2e` builds current frontend source and serves the same-origin production preview; it uses real Django/PostgreSQL for authentication/library/review flows at desktop and phone widths 360/390/430 px, then removes its randomized users, test hymns, and uploaded PDFs. Reader prerequisites use a separate authenticated fixture account; UI authentication journeys keep their own sessions. Existing Chrome/Edge is used when available; otherwise Chromium downloads into the project. Use a normal user terminal; restricted Windows processes can prevent Playwright from terminating its server tree.

CI runs backend, frontend, production-container checks and four isolated browser-profile jobs. Browser jobs test email-capable mode plus the simple-account flows, upload per-mode coverage and failure artifacts, then merge reports. The final `checks` job requires every dependency to pass. The existing local command remains serial. For an optional parallel matrix with disposable databases and separate ports, use `.\.venv\Scripts\python.exe scripts/system-browser.py --jobs 2`. See the [test optimization plan and results](docs/system-test-optimization-plan.md) for the preserved coverage contract, commands and pending release checks.

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

The production image and fresh-container PDF persistence have passed Linux GitHub CI. Native Windows development uses portable tools. Running Compose locally requires an installed Docker engine. Stop portable PostgreSQL first; Compose also uses port 55432. Docker manages storage outside the repository; use it only where that is permitted. It was not invoked under the current project-only write constraint.

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
| [API contract](docs/api.md) | Implemented auth/library/planning/lifecycle/usage interfaces; future ranking contracts |
| [Dependencies](docs/dependencies.md) | Actual runtimes, resolved pins, limitations |
| [Backlog](docs/backlog.md) | Delivered and upcoming packages |
| [Code documentation](docs/code-documentation.md) | Contracts and comments to maintain |
| [Acceptance fixtures](docs/acceptance.md) | Fictional deterministic examples |
| [UX walkthrough](docs/ux-walkthrough.md) | Proposed later screens and pilot demo |
| [M0 report](docs/m0-report.md) | Engineering preparation evidence |
| [M1 report](docs/m1-report.md) | Implementation, checks, limits |
| [M2 report](docs/m2-report.md) | Library delivery, acceptance evidence, remaining scope |
| [M3 report](docs/m3-report.md) | Completed M3 checkpoint, draft planning and review evidence |
| [M4 report](docs/m4-report.md) | Lifecycle/usage/history progress and required real-phone acceptance |
| [M3 UI review](docs/m3-ui-review.md) | Compact planner, icon actions, Maronite calendar and 36 demo hymns |
| [Calendar](docs/calendar.md) | Public API, fallback boundaries and choir calendar settings |

## Save progress with Git

The repository uses `main` with origin `https://github.com/tofi-75/Choralation.git`. The latest deployed application commit is `91a8c56`. Commit, push, and deployment require authorization for the next release. To change the author for future commits and save progress yourself, replace these examples:

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

## October 10 picker improvements

Desktop hymn suggestions have sortable metadata columns; phones retain compact cards with a compact language/genre/sort row. The music mark collapses the desktop sidebar. Drag a hymn's left handle to reorder within its placement; keyboard users can press Space, use the arrows, then Space to drop or Escape to cancel. Any-season hymns do not produce season notices. See [review and verification](docs/picker-review.md). These refinements are deployed; physical-phone acceptance remains pending.

Mass plans opens on **Saved Masses**; switch to **Drafts** to continue editing an autosaved program. The list has compact search and an adjacent Filters icon. See [Mass list review and test evidence](docs/mass-list-review.md).

## Performance reading and UI refinements

Saved Masses now offer **Focus mode** for PDF → lyrics → title reading, with touch/keyboard navigation and a screen-awake request on supported secure origins. Hymn detail leads with sheet music and lyrics; forms include optional Latin Characters Name (searchable), lyrics, tempo and default key. Apply the normal migrations after updating. See [implementation, acceptance and next UI improvements](docs/ui-performance-review.md), including deferred full Arabic translation and language settings. Physical-phone acceptance remains M5.

Public information is served without sign-in or JavaScript at `/about`, `/privacy` and `/terms`. See [Gmail verification readiness](docs/google-verification.md) for the privacy-request runbook, local delivery acceptance, Google scope justification and remaining domain/owner release gates. The policy identifies Toufic Lattouf (Lebanon) and tofi.lattouf@gmail.com as the operator/contact. Google approval and hosted delivery are separate from local engineering checks.

Shipped account and reader refinements add username availability, password strength feedback, compact PDF controls, immersive fullscreen, replacement previews and revised standard Mass sections. See [behavior, migration and missing-PDF recovery notes](docs/reader-and-account-refinements.md). These refinements are included in the deployed release.

Regular members can save private hymns under **My hymns** and request planner approval before publication. Choir Leaders and Planners review them from **Choirs → Hymn submissions**. See [workflow, privacy boundary and migration/rollback notes](docs/member-hymn-submissions.md).

PDF persistence repair: [durable PDF setup](docs/pdf-storage-setup.md).

Admin classification management and choir calendar configuration: [M6 usage, upgrade and release gates](docs/m6-settings.md).
