# Mass Hymn Picker

A focused internal application for maintaining a hymn library, preparing Mass programs, and suggesting suitable hymns using finalized program history.

## Project status

M0 engineering preparation is complete as of October 6, 2026. The application itself has not been scaffolded, installed, or deployed. M1 is the next implementation milestone. Coordinator review of the proposed UX is still pending; no human usability acceptance is claimed.

## Start here

| Document | Purpose |
| --- | --- |
| [Original specification](mass_hymn_picker_codex_spec.md) | Authoritative product requirements |
| [Development plan](DEVELOPMENT_PLAN.md) | Milestones, scope, estimates, and release gates |
| [Architecture decisions](docs/architecture.md) | Resolved M0 decisions and implementation boundaries |
| [API contract](docs/api.md) | Authentication, payloads, permissions, revisions, errors, and query semantics |
| [Dependency baseline](docs/dependencies.md) | Verified version selections and M1 installation prerequisites |
| [Delivery backlog](docs/backlog.md) | Owned work packages, dependencies, and acceptance evidence |
| [UX walkthrough](docs/ux-walkthrough.md) | Desktop/mobile sketches and pilot demo script |
| [Acceptance fixtures](docs/acceptance.md) | Deterministic fictional records and expected results |
| [Code documentation standard](docs/code-documentation.md) | How implementation code and interfaces must be documented |
| [M0 completion report](docs/m0-report.md) | Deliverables, validation evidence, and remaining external review |

## Verify the M0 package

Run from the project root using the Node executable already available on PATH:

```powershell
node .\scripts\verify-m0.mjs
```

This read-only check validates local Markdown links, requirement-section coverage, fixture relationships, derived statistics, and expected recommendation scores. It does not start the app, install dependencies, or write files. Its scoring check verifies planning examples, not an implemented recommendation service.

## Implementation environment

The selected baseline is Python 3.14.8, Django 5.2.17 LTS, PostgreSQL 18.6, and Node 24.21.0. Exact package selections and source links are recorded in [the dependency decision](docs/dependencies.md). Registry compatibility was inspected; dependency installation and executable application checks belong to M1.

Python, npm, and Docker were not found on the current command PATH. The existing Node executable reports 24.19.0. No system tools were installed or reconfigured during M0. Keep environments, package caches, browser artifacts, and generated files under this project when implementing future milestones unless the user changes that constraint.

Setup, database migration, server start, application test, and production deployment commands will be documented when those capabilities exist. Do not interpret illustrative API requests in the design documents as working endpoints.

## Save progress with Git

This project uses a local Git repository on `main`. The initial M0 snapshot was committed by Codex using a commit-only identity; your global Git author settings were not changed. No remote repository is configured.

Before making your own commits, set your author identity for this project only, replacing these examples with your name and email:

```powershell
git config --local user.name "Your Name"
git config --local user.email "you@example.com"
```

Review and save a coherent change:

```powershell
git status
git diff
git add README.md
git diff --cached
git commit -m "Describe the completed change"
git log --oneline -5
```

Use the actual changed file paths instead of the example `README.md`. `.gitignore` excludes local secrets, environments, caches, builds, and test artifacts. Dependency lock files and Django migrations should be committed when introduced. The original specification is exempt from line-ending conversion so its recorded M0 checksum remains stable.
