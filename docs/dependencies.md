# Dependency decisions — M0 and M1

**Verified:** October 6, 2026. **State:** M0 direct selections are now installed and resolved in M1 on Windows. Python version locks and npm's generated lock are committed; container execution remains unverified. No global tool/configuration was changed.

## Runtime decisions

| Component | Selected | Rationale/source |
| --- | --- | --- |
| Python | 3.14.8, regular CPython build | Current bugfix-series release at verification; [Python releases](https://www.python.org/downloads/) |
| Django | 5.2.17 LTS | Supported LTS with extended support through April 2028; [supported releases](https://www.djangoproject.com/download/) |
| PostgreSQL | 18.6 | Supported stable series; [version policy](https://www.postgresql.org/support/versioning/) and [release notes](https://www.postgresql.org/docs/release/18.6/) |
| Node | 24.19.0, supported 24.x | M1 uses the available executable copied into `.local/node`; corrects M0's proposed 24.21.0; [Node downloads](https://nodejs.org/en/download) |
| Frontend package manager | npm 11.21.0 | Project-local archive verified against registry SHA512; `packageManager` captures this version |

Django 5.2 explicitly supports Python 3.14 starting with 5.2.8; see its [release notes](https://docs.djangoproject.com/en/5.2/releases/5.2/). Python 3.15 was still presented as prerelease by the checked page, so it is not selected. Container digests were verified through the official Docker Hub registry in M1 and are recorded below.

## Direct dependency pins

Machine-readable M0 selections are preserved in [dependency-baseline.json](dependency-baseline.json). Registry metadata was retrieved from official PyPI/npm records linked below. M1 retains all direct package selections, records actual npm/Node in `frontend/package.json`, and verifies installation/build compatibility. Resolved files are linked below.

| Backend package | Version | Purpose |
| --- | --- | --- |
| [Django](https://pypi.org/project/Django/5.2.17/) | 5.2.17 | Framework, users, sessions, ORM |
| [djangorestframework](https://pypi.org/project/djangorestframework/3.18.1/) | 3.18.1 | API |
| [django-filter](https://pypi.org/project/django-filter/26.2/) | 26.2 | Query filters |
| [drf-spectacular](https://pypi.org/project/drf-spectacular/0.30.0/) | 0.30.0 | OpenAPI |
| [psycopg](https://pypi.org/project/psycopg/3.3.6/) | 3.3.6 | PostgreSQL; use binary extra for local reproducibility |
| [gunicorn](https://pypi.org/project/gunicorn/26.2.0/) | 26.2.0 | Linux production server; do not execute on native Windows |
| [dj-database-url](https://pypi.org/project/dj-database-url/3.1.2/) | 3.1.2 | Safe DATABASE_URL parsing |
| [pytest](https://pypi.org/project/pytest/9.1.1/) | 9.1.1 | Backend tests |
| [pytest-django](https://pypi.org/project/pytest-django/4.14.0/) | 4.14.0 | Django test integration |
| [ruff](https://pypi.org/project/ruff/0.16.10/) | 0.16.10 | Lint and formatting; no separate Black |

DRF 3.18.1 and django-filter 26.2 declare Django >=5.2. The chosen Django/DRF/filter/psycopg/pytest-django records declare Python 3.14 support. Windows wheel installation and checks passed. Do not add django-cors-headers for the selected same-origin topology.

| Frontend/runtime package | Version |
| --- | --- |
| [react](https://registry.npmjs.org/react/19.3.0), [react-dom](https://registry.npmjs.org/react-dom/19.3.0) | 19.3.0 each |
| [typescript](https://registry.npmjs.org/typescript/6.0.3) | 6.0.3 |
| [vite](https://registry.npmjs.org/vite/8.3.2), [@vitejs/plugin-react](https://registry.npmjs.org/@vitejs%2Fplugin-react/6.1.2) | 8.3.2 / 6.1.2 |
| [react-router](https://registry.npmjs.org/react-router/8.4.0) | 8.4.0 |
| [@tanstack/react-query](https://registry.npmjs.org/@tanstack%2Freact-query/5.104.1) | 5.104.1 |
| [react-hook-form](https://registry.npmjs.org/react-hook-form/7.89.0) | 7.89.0 |
| [zod](https://registry.npmjs.org/zod/4.6.5) | 4.6.5 |
| [tailwindcss](https://registry.npmjs.org/tailwindcss/4.3.3), [@tailwindcss/vite](https://registry.npmjs.org/@tailwindcss%2Fvite/4.3.3) | 4.3.3 each |
| [@radix-ui/react-dialog](https://registry.npmjs.org/@radix-ui%2Freact-dialog/1.1.23) | 1.1.23 |
| [@types/react](https://registry.npmjs.org/@types%2Freact/19.3.0), [@types/react-dom](https://registry.npmjs.org/@types%2Freact-dom/19.3.0) | 19.3.0 each |
| [@types/node](https://registry.npmjs.org/@types%2Fnode/24.19.1) | 24.19.1 |

Choose a small Radix-based accessible custom component layer. Add further primitives only when a feature requires them, with reviewed exact pins.

| Quality package | Version |
| --- | --- |
| [vitest](https://registry.npmjs.org/vitest/5.0.3) | 5.0.3 |
| [@testing-library/react](https://registry.npmjs.org/@testing-library%2Freact/16.3.3) | 16.3.3 |
| [@testing-library/dom](https://registry.npmjs.org/@testing-library%2Fdom/10.4.2) | 10.4.2 |
| [@testing-library/user-event](https://registry.npmjs.org/@testing-library%2Fuser-event/14.6.7) | 14.6.7 |
| [@testing-library/jest-dom](https://registry.npmjs.org/@testing-library%2Fjest-dom/7.0.1) | 7.0.1 |
| [jsdom](https://registry.npmjs.org/jsdom/30.1.2) | 30.1.2 |
| [@playwright/test](https://registry.npmjs.org/@playwright%2Ftest/1.63.0) | 1.63.0 |
| [eslint](https://registry.npmjs.org/eslint/10.12.0), [@eslint/js](https://registry.npmjs.org/@eslint%2Fjs/10.0.1) | 10.12.0 / 10.0.1 |
| [typescript-eslint](https://registry.npmjs.org/typescript-eslint/8.71.1) | 8.71.1 |
| [prettier](https://registry.npmjs.org/prettier/3.9.9) | 3.9.9 |

**Compatibility decision:** Registry `latest` for TypeScript was 7.0.2, but typescript-eslint 8.71.1 declares `>=4.8.4 <6.1.0`. TypeScript 6.0.3 is installed. Vite's React plugin requires Vite 8; Vitest 5 accepts Vite 8. Actual Node 24.19.0 satisfies the inspected requirements, including jsdom's >=24.15.0 branch. npm installation, type checks, tests, and build passed without force or ignored peer errors.

## Original M1 reproducibility checklist

1. Establish usable Python/npm and PostgreSQL tooling without violating the project-only write constraint. M1 uses portable archives and an existing copied Node executable; no host installer or service is needed.
2. Create project-local `.venv`, package caches, generated schema/test directories, and browser storage. Set each tool's relevant cache variables before installation (not user/system environment configuration).
3. Create exact direct Python inputs and resolve a fully pinned requirements set, including transitive dependencies, with hashes where supported. Install and test it under Python 3.14; keep Gunicorn production-specific.
4. Create frontend `package.json` with exact versions and a real `package-lock.json` using npm. Capture the exact npm version. Use `npm ci` for subsequent reproducible installs.
5. Verify engine/peer compatibility, installed versions, Python imports, frontend build, TypeScript checking, and the M1 checks. Lock files are generated by real tools, never handwritten claims of resolution.
6. Pin container versions/digests after checking registry availability. Record any required version correction with its source and rerun compatibility checks.

## M0 observed environment

Read-only PATH inspection found Git and Node 24.19.0. Python/`py`, npm, and Docker were absent from PATH. This does not establish that they are absent everywhere on disk or that Docker's daemon is unavailable; M1 can inspect a known existing installation. No global/profile files were inspected or changed to configure the environment.

## M1 resolved environment and provenance

The [bootstrap script](../scripts/bootstrap.ps1) installs exact portable tools into ignored `.local`, installs [backend development requirements](../backend/requirements/dev.txt), and runs npm ci against [the generated npm lock](../frontend/package-lock.json). [Base](../backend/requirements/base.txt) and [Linux production](../backend/requirements/production.txt) requirements share exact pins. [The lock generator](../scripts/lock-backend.py) follows successfully installed metadata and validates dependency specifiers/extras. Python locks contain version pins without artifact hashes and were verified on Windows; Linux production installation remains unverified.

| Artifact | Primary source and verification |
| --- | --- |
| Python 3.14.8 Windows x64 full portable ZIP | [Official archive](https://www.python.org/ftp/python/3.14.8/python-3.14.8-amd64.zip); SHA256 `4873947a8afc037846b180312b83c744a4146a851cfd316a75c3125a4d8299da` from official install-manager release metadata |
| npm 11.21.0 | [Registry record](https://registry.npmjs.org/npm/11.21.0); archive integrity checked against its published SHA512, captured in bootstrap |
| PostgreSQL 18.6 Windows x64 binaries | [EDB archive](https://get.enterprisedb.com/postgresql/postgresql-18.6-1-windows-x64-binaries.zip) linked by PostgreSQL's Windows download flow; observed/tested SHA256 `fbe23da234ee31547bf8a36d29dfd81e82b849df2d2b78d2eecb43d360252f8c` (a measured archive hash, not an independently published checksum) |
| Python container | [Official tag metadata](https://hub.docker.com/v2/repositories/library/python/tags/3.14.8-slim); digest `sha256:c3e521df8b2b498a7a682e7e18676771cb80c6b75b8699af886b2d554ce40151` |
| PostgreSQL container | [Official tag metadata](https://hub.docker.com/v2/repositories/library/postgres/tags/18.6); digest `sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722` |

Docker configuration is supplied and pinned but not executed; Docker is unavailable on this machine. Installed Windows runtimes, PostgreSQL tests, frontend build, and browser smoke are verified in [the M1 report](m1-report.md). Update actual runtime/pin decisions here when intentionally upgrading; do not regenerate locks opportunistically to latest.

## Hosting additions — October 13, 2026

WhiteNoise 6.12.0 and django-storages[s3] 1.14.6 were verified against PyPI and installed in the project virtual environment. The existing lock generator resolves their S3 transitive dependencies into the base/dev/production locks. Runtime pins remain Python 3.14.8, Node 24.19.0 and npm 11.21.0. The new production image builds React and serves it with Django; the development backend Dockerfile remains separate. See [hosting report](hosting-report.md) for actual verification status.
