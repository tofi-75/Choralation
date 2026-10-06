# M2 completion report — useful hymn library

**Date:** October 6, 2026. **Engineering status:** Implemented and verified on Windows with real PostgreSQL. Coordinator acceptance remains pending. The project owner requested a Git checkpoint on October 7, 2026. The original specification is unchanged.

**Review follow-up (October 7, 2026):** Background query failures now preserve the mounted hymn form, including unsaved voices and PDFs; three regression cases verify failure and retry. The Docker image provisions private media storage for its non-root user and Compose persists it in a named volume. All 79 backend and 16 frontend tests, migration/schema checks, lint, formatting, typing, and production build passed. Docker runtime verification remains unavailable.

## Delivered increment

Admins and Planners can enter, classify, edit, and find saved hymns. Viewers can read the library and details. Admins can confirm deactivation, reactivation, and deletion. The desktop library uses a comparison table; mobile uses cards and a focused filter dialog. Arabic and Syriac metadata round-trips through the database and renders with automatic text direction.

| Package | Delivered behavior | Main implementation |
| --- | --- | --- |
| M2.1 Domain | All source Hymn fields; independent five category models; nullable metadata; authorship; database constraints; protected language deletion | [Models](../backend/hymns/models.py), [migration](../backend/hymns/migrations/0001_initial.py) |
| M2.2 Seeds | 38 create-only category defaults, stable slugs, no resets; separate optional three-hymn fictional development seed | [Initial seed](../backend/hymns/management/commands/seed_initial_data.py), [demo seed](../backend/hymns/management/commands/seed_demo_data.py) |
| M2.3 API | Secured CRUD; category reorder/reference counts; strict validation; literal combined filters; stable pagination; prefetched nested reads | [Services](../backend/hymns/services.py), [selectors](../backend/hymns/selectors.py), [views](../backend/hymns/views.py) |
| M2.4 Interface | Library, all-field add/edit forms, saved detail; searchable multiselects; URL filters; 300 ms search debounce; title/newest sorting | [Library](../frontend/src/pages/LibraryPage.tsx), [form](../frontend/src/pages/HymnFormPage.tsx), [detail](../frontend/src/pages/HymnDetailPage.tsx) |
| M2.5 Safety | Failed-save input retention and field errors; Admin confirmations/cancel focus; inactive link retention; UI/API role checks; guarded admin forms | [Admin](../backend/hymns/admin.py), [form tests](../frontend/src/pages/HymnFormPage.test.tsx), [browser flows](../frontend/tests/e2e/library.spec.ts) |

Title duplicates are allowed. Creation requires a title, active language, and at least one active placement; a nonneutral hymn requires a season. Existing inactive links remain visible and retainable, but cannot be added anew. Category names are unique after trimming and lowercasing; slugs never change on rename. Reference checks protect every current incoming category relation, including M2M links that would otherwise cascade.

HTTP and Django admin use the same permission-checked transactional services. Mutations lock an existing hymn before categories in fixed type/ID order; category deactivation/deletion uses the same category locks. Validation failures leave metadata and relationships unchanged. Bulk admin deletion is disabled to preserve these safeguards.

Library dimensions combine with AND, IDs inside a dimension with OR. Season filters are literal and exclude neutral-only hymns. Search covers title, alternate title, first line, composer, source/hymnal, and tag names without duplicate joined rows. Unknown/repeated query parameters, missing IDs, and unavailable usage filters/sorts fail explicitly. Pagination supports 25/50/100 with deterministic ties. Router URL updates are synchronous so native controlled checkboxes respond immediately; query loading states remain explicit.

## Verification evidence

Run commands from the project root with PostgreSQL running:

```powershell
.\dev.cmd check
.\dev.cmd e2e
.\.local\node\node.exe .\scripts\verify-m0.mjs
```

| Gate | Evidence |
| --- | --- |
| Backend | 66 tests, including all previous authentication checks plus 38 library cases and one real two-connection PostgreSQL race |
| Frontend | 11 integration tests, including direct Viewer form access, classification requirements, searchable choices, and preserved failed-save values/errors |
| Real browsers | 12 successful flows across desktop 1280×900 and mobile 390×844: authentication plus Planner creation/edit/search/filter/history/retry, Viewer permissions, and Admin confirm/deactivate/reactivate/delete |
| Schema and tooling | Django checks and migration drift, dependency consistency, Ruff lint/format, TypeScript, ESLint, Prettier, validated OpenAPI, and production frontend build |
| Database setup/seeds | Genuine M2 migration applied to development PostgreSQL; first category seed created 38 records, replay created zero; tests preserve edited seed names/order/active state and repeat optional demo seeding |
| Query/concurrency behavior | A 25-row list with related classifications takes at most six data queries; the concurrent link test observes PostgreSQL waiting on the category lock, then rejects the newly inactive relation without writing a hymn |
| Visual review | Desktop/mobile library, form, and detail screenshots inspected; no horizontal library overflow at tested sizes; confirmations default focus to Cancel and restore the trigger after cancellation |

Backend tests use the separate PostgreSQL test database. Browser tests use randomized run-specific users and attributed hymns, then remove only those records. They use ports 8001/5174, separate from ordinary development. Per-run test temporary directories, runtimes, caches, profiles, generated schema, screenshots, and builds remain inside this project. No global installation, saved execution-policy change, outside-project edit, or deployment was performed.

The development database has the migration and 38 defaults. No fictional demo hymns were loaded into it for delivery; temporary browser hymns/accounts were cleaned up. Follow [README](../README.md) to restart the backend, open the library, or explicitly add the separate development demo.

## Remaining scope and limits

- M3 introduces saved draft Masses, selection ordering/notes, revision conflicts, and recoverable autosave.
- M4 introduces finalization/reopening, history, and derived usage. M2 does not return fabricated usage fields or expose usage filters.
- M5 introduces recommendation scoring and contextual warnings. M6 supplies the complete React category Settings UI; category writes already work through the secured API and Django admin.
- Docker/Linux execution, production deployment/restore, large-library performance measurement, and coordinator pilot acceptance remain unverified. Docker is unavailable on this machine; its configuration was not executed.
- Browser coverage uses Chromium at two viewport sizes, not Safari/Firefox or a physical phone. Unicode content is supported; a fully translated interface and language-specific search normalization are deferred.
- Draft/program references do not exist yet. M3 must add protected selection foreign keys and extend reference tests before exposing planning.

The next usable milestone is **M3 persistent draft planning**, as specified in the [development plan](../DEVELOPMENT_PLAN.md).
