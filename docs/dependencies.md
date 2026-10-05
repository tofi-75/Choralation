# Dependency selection — M0

**Verified:** October 6, 2026. **State:** Exact direct-version selections, not an installed or fully resolved environment. No package manager, browser, container, or global tool was installed during M0.

## Runtime decisions

| Component | Selected | Rationale/source |
| --- | --- | --- |
| Python | 3.14.8, regular CPython build | Current bugfix-series release at verification; [Python releases](https://www.python.org/downloads/) |
| Django | 5.2.17 LTS | Supported LTS with extended support through April 2028; [supported releases](https://www.djangoproject.com/download/) |
| PostgreSQL | 18.6 | Supported stable series; [version policy](https://www.postgresql.org/support/versioning/) and [release notes](https://www.postgresql.org/docs/release/18.6/) |
| Node | 24.21.0 LTS | Supported LTS baseline; [Node downloads](https://nodejs.org/en/download) |
| Frontend package manager | npm bundled with the selected Node distribution | Capture its exact version in M1's `packageManager` field after verification; no global install |

Django 5.2 explicitly supports Python 3.14 starting with 5.2.8; see its [release notes](https://docs.djangoproject.com/en/5.2/releases/5.2/). Python 3.15 was still presented as prerelease by the checked page, so it is not selected. PostgreSQL exact image tag/digest must be verified against the container registry in M1; do not fabricate a digest or use a floating `latest` tag.

## Direct dependency pins

Machine-readable version selections are in [dependency-baseline.json](dependency-baseline.json). Registry metadata was retrieved read-only from each package's official PyPI/npm JSON endpoint. Links below are the corresponding primary package records. These pins are selection evidence; only M1 installation can establish the fully resolved dependency set and build compatibility.

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

DRF 3.18.1 and django-filter 26.2 declare Django >=5.2. The chosen Django/DRF/filter/psycopg/pytest-django records declare Python 3.14 support. Transitive wheel availability remains an installation check. Do not add django-cors-headers for the selected same-origin topology.

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

**Compatibility decision:** Registry `latest` for TypeScript was 7.0.2, but typescript-eslint 8.71.1 declares `>=4.8.4 <6.1.0`. Select TypeScript 6.0.3 instead. Vite's React plugin requires Vite 8; Vitest 5 accepts Vite 8. Node 24.21.0 satisfies the inspected Node requirements, including jsdom's >=24.15.0 branch. Do not use `--force` or ignore peer errors to claim a valid install.

## M1 reproducibility work

1. Establish usable Python/npm and PostgreSQL tooling without violating the project-only write constraint. Containers may supply Python/PostgreSQL if a Docker host is already available. If installing a host runtime is necessary, that is separate work requiring a change to the current boundary.
2. Create project-local `.venv`, package caches, generated schema/test directories, and browser storage. Set each tool's relevant cache variables before installation (not user/system environment configuration).
3. Create exact direct Python inputs and resolve a fully pinned requirements set, including transitive dependencies, with hashes where supported. Install and test it under Python 3.14; keep Gunicorn production-specific.
4. Create frontend `package.json` with exact versions and a real `package-lock.json` using npm. Capture the exact npm version. Use `npm ci` for subsequent reproducible installs.
5. Verify engine/peer compatibility, installed versions, Python imports, frontend build, TypeScript checking, and the M1 checks. Lock files are generated by real tools, never handwritten claims of resolution.
6. Pin container versions/digests after checking registry availability. Record any required version correction with its source and rerun compatibility checks.

## Observed local environment

Read-only PATH inspection found Git and Node 24.19.0. Python/`py`, npm, and Docker were absent from PATH. This does not establish that they are absent everywhere on disk or that Docker's daemon is unavailable; M1 can inspect a known existing installation. No global/profile files were inspected or changed to configure the environment.
