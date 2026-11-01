# M6 — Classification and choir calendar settings

M6 delivers Admin classification management and choir-scoped calendar settings. Physical-phone/coordinator acceptance, recommendations, Arabic translation, Practice, a full diocesan Ordo and a broad date-range editor remain separate work.

## Use the new screens

1. Sign in as an application Admin and open **Settings** in the navigation. Choir Planner status alone does not grant global classification administration.
2. Select Genres, Seasons, Mass sections, Languages or Tags. Search/filter, add a name/description or edit an existing category. Slugs and IDs stay stable when renaming.
3. Clear search and use **All** to reorder the entire category type. Up/down controls work with touch and keyboard; choose **Save order** to commit atomically or discard the draft.
4. Deactivate/reactivate with confirmation and reference counts. Deactivation preserves saved links and hides the category from new choices. Delete is available only when no hymn, Mass, selection or calendar override refers to the category. Private/pending hymn references are included in Admin impact checks without disclosing hymn contents.
5. Open **Choirs → your choir → Choir calendar**. Members see read-only settings. This choir's Planners and platform Admins can choose Maronite/manual defaults, an IANA timezone, and exact-date season overrides.
6. Preview a date using saved settings. Override wins, then manual mode, then the existing Maronite provider/local fallback. Existing saved programs keep their dates and seasons.
7. If someone saves concurrently, reload the settings and reapply your intended edit. Inputs remain available on a failed save. Navigation, reload and sign-out guard unsaved edits.

Inactive saved hymn/category labels remain visible. Explicitly rerunning classification seeds preserves edited existing rows, but can recreate deleted seed defaults: prefer deactivation for unwanted defaults. Reordering or relabelling does not modify finalized hymn usage.

## Local upgrade

The additive migration `choirs.0002_calendarsettings_calendaroverride` creates two calendar tables. It does not rewrite accounts, passwords, Masses, selections or storage keys. Missing settings read as Maronite/Asia/Beirut; no bulk data seeding is needed. Choir configuration is created on first successful settings write.

On November 1, the local database was backed up with `pg_dump`, the archive listing checked, and the migration applied. Fingerprints of existing rows across accounts/profiles, choirs/memberships, hymns/PDF references, placement associations, Masses and selections were unchanged. The private archive remains under ignored `.local/backups`; do not commit or upload it.

For another local installation, stop writes, back up PostgreSQL and PDFs, then run:

```powershell
.\dev.cmd db-start
.\.venv\Scripts\python.exe -B backend\manage.py migrate
```

Restart the backend/frontend and open the screens above. No email, S3, billing, compute-plan or automatic-deployment settings need to change for M6.

## Release gates

Before hosted migration, make a fresh hosted database backup using the existing interactive helper:

```powershell
.\.venv\Scripts\python.exe -B scripts\backup-hosted.py
```

The helper uses a hidden memory-only password and exports the application schema without changing it. Keep original PDFs and the separate bucket backup. Never paste passwords/URLs, save secrets in source or include archives in Git.

Review the diff and secret/artifact scan, commit/push reviewed source, wait for GitHub checks (including Docker/container serving) to pass, then manually deploy that exact commit to the existing service. Preserve the compute plan and automatic-deployment setting. The November 1 read-only service check confirmed automatic deployment remains off; its HTTP health-check path is empty in the live service, so verify/configure `/health/ready/` as part of the hosted release rather than assuming the Blueprint has already synchronized it. Startup applies the additive migration. After readiness passes, confirm Admin-only Settings, member read-only calendar access, Planner writes, choir isolation, and existing programs/PDF access on the public URL.

Application rollback does not reverse migrations. Keep the additive tables when rolling application code back; do not undo migrations containing useful calendar settings without a separately reviewed backup/restore plan.

## Validation record

The full backend suite passed **419 tests**, and frontend unit validation passed **115 tests**. Schema validation, migration consistency, Django checks, type checking, lint/format, the production build and actual production-serving smoke checks passed. Focused concurrency tests confirm simultaneous first calendar saves and category edits produce one successful write and one stale-version conflict. The full email-enabled browser suite passed **120 scenarios**; its eight expected mode-specific skips were exercised separately with email features disabled and **all eight passed**. That verifies **128 browser scenarios across desktop, 390px, 360px and 430px**, including all eight new M6 settings scenarios. The disposable databases were removed. No real account emails were sent. The pending-source scan found no credentials, database archives, logs or generated evidence in the release source set.

**Hosted release is pending.** A fresh hosted backup, exact-commit CI/deployment, and authenticated hosted acceptance must be recorded before calling M6 live. Simulated phone viewports do not complete physical-phone acceptance.
