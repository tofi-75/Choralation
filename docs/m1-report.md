# M1 completion report — authenticated application

**Date:** October 6, 2026. **Engineering status:** M1 implemented and verified on Windows with native PostgreSQL. M2–M7 remain planned. Coordinator acceptance, container execution, and production deployment are not claimed.

## Usable increment

A provisioned Admin, Planner, or Viewer can sign in, refresh, see their actual identity/role in a protected workspace, use mobile navigation, and sign out. Expired sessions return to login and private cached data is cleared. Credentials/network failures have visible feedback and retry; login input is retained after failure.

Only the working workspace destination appears in navigation. It contains no invented hymns, programs, counts, or usage. First-admin and team provisioning are documented in the [README](../README.md).

## Delivered work packages

| Package | Implementation |
| --- | --- |
| M1.1 Foundation | Django/DRF settings, PostgreSQL-only connection, migrations/roles, exact dependency inputs and resolved locks, private environment generation, portable Windows tools, Docker configuration |
| M1.2 Authentication | CSRF bootstrap/protected anonymous writes, login/me/logout, Django sessions/passwords, group/capability policy, protected schema, provisioning commands |
| M1.3 Shared interface | Responsive React shell, route guards, focus-managed mobile dialog, skip link, visible focus, validated typed API client, session query ownership, loading/error/retry states |
| M1.4 Verification | Aggregate PowerShell gate, PostgreSQL-backed pytest, Vitest/Testing Library, lint/format/type checks, migration drift, OpenAPI validation, frontend production build |
| M1.5 Browser smoke | Three roles at 1280×900 and 390×844; login/bad credentials/refresh/expiry/logout, mobile Escape/focus restoration, overflow checks |

Docstrings and comments explain CSRF, role precedence, cache ownership, environment precedence, provisioning safety, extraction boundaries, and test-user lifecycle. Read [the documentation standard](code-documentation.md) when extending these foundations.

## Verification evidence

| Check | Observed result |
| --- | --- |
| Fresh database/migration | PostgreSQL 18.6 initialized in `.local/pgdata`; all migrations applied |
| Repeat setup/migration/roles | Locks reinstall; `.env` retained; no pending migrations; idempotent role provisioning |
| Backend | 27 passed against PostgreSQL: auth, CSRF/rotation, invalid/inactive credentials, session invalidation, role matrix/precedence, provisioning, environment, generic health failures |
| Frontend | 8 passed: typed transport/CSRF, proxy/network/malformed responses, route guards, accessible validation, retained credentials, retry, login/logout, expiry/cache removal |
| Real browsers | 6 passed; runner exits successfully and removes randomized test users |
| Dependencies | `pip check` passes; npm installs without force or ignored peer requirements |
| Quality | Django checks, migration drift, Ruff lint/format, TypeScript, ESLint, Prettier, validated OpenAPI pass |
| Build | Vite production build succeeds; hosting remains unimplemented |
| Production settings | `DJANGO_DEBUG=false` and `check --deploy --fail-level WARNING` report no issues; deployment review remains M7 |
| PowerShell | All project scripts parse successfully |

Reproduce using the [README verification commands](../README.md). Test credentials are fictional; browser usernames are randomized. No default user/password is committed.

The first restricted Windows browser run passed assertions but stalled at server shutdown. Its identified processes/accounts were cleaned up. A fresh normal-user run passed and exited cleanly. PostgreSQL startup also required normal-user context; neither workaround installed a service or changed global settings.

## Runtime and storage

All written tooling/application/database/cache files remain inside the project. Git excludes secrets, runtimes, dependencies, builds, and browser artifacts. Environment configuration is process-scoped. The original specification's SHA256 remains `53f4f71d36f946b5cf9c91f6aced925bdeb5b2b561eead9e29a20b86890d9d00`.

Tested versions: Python 3.14.8, PostgreSQL 18.6, Node 24.19.0, npm 11.21.0. Node corrects the proposed M0 24.21.0 baseline to the available compatible executable. [Dependency decisions](dependencies.md) record provenance, image digests, and lock limitations.

HTTP-only session/CSRF cookies use same-origin requests and a masked bootstrap token. Login explicitly checks CSRF before authentication. Private API/schema responses are no-store. Production defaults disable debug, require HTTPS, and secure cookies. No password/token browser persistence is added.

## Remaining limits and next increment

- Official registry image digests are pinned; Docker build, Linux installation, and startup remain unverified because Docker is unavailable.
- Python locks pin the installed closure by version without artifact hashes. Windows execution is verified; Linux production installation requires its own gate.
- There is no configured CI host or Git remote. Local scripts are the current verification pipeline.
- Role policy is tested; domain endpoints start in M2. Apply and verify policy on each endpoint rather than relying on frontend visibility.
- First-admin creation is an explicit password prompt. No persistent sample accounts were created for the user. Coordinator review and real team provisioning remain operational steps.
- Authentication throttling, production hosting/static configuration, recovery, and broader accessibility/performance review remain M7 work. M1 is a local development preview.

**Next:** M2 classification/Hymn models, seeds, secured CRUD/search/filter APIs, and the usable library. See [the backlog](backlog.md).
