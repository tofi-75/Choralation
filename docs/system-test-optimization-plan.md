# System test optimization plan

Planned, implemented and verified locally November 21, 2026 after separately committing the feature/review repairs as `a24a6ef`. The system-test update is prepared as a separate commit for GitHub build verification. The complete local browser matrix passes; Linux CI and physical-device acceptance remain separate release checks. Hosted deployment is not part of this update.

## Implementation and current evidence

- Vitest uses `vmThreads`, two workers and its default per-file isolation. Three alternating full-suite trials passed the identical 133 case identifiers/statuses in both pools. Fork times: 32.39/38.42/31.45 s; VM times: 15.29/16.60/15.89 s. Median elapsed time fell from **32.39 s to 15.89 s (51%)** on local Windows with Node 24.19.0. These are current tests, including the six gesture regressions added after the original baseline below.
- A separate Windows process-tree sample every 50 ms measured peak working sets of approximately **695 MiB (forks) and 814 MiB (VM threads)**. The VM pool uses about 119 MiB more in that observation; this includes shared resident pages and is not a precise private-memory measurement. Both runs passed all cases. Retain two workers and verify Linux runner memory before release.
- Backend, frontend, four browser profiles and production-container checks have separate CI jobs. Each browser job has its own PostgreSQL service, one worker, randomized fixture accounts and run-specific uploads/email directories. All profiles run the full email-capable suite and simple-account signup, private approvals, hymn submission and Choirmaster requests. The separate password preflight was removed; its two cases remain in the full suite.
- The checked production frontend build and PDF assets are prepared once and passed to the four CI preview servers. Local `e2e` builds current source by default. `E2E_PREBUILT=true` is an explicit CI/diagnostic opt-in requiring a complete existing build, not a source-freshness check. Same-origin proxying and strict occupied-port rejection remain enabled. Switching account modes starts fresh backend/frontend services.
- Reader UI creation/search remains a full UI case. PDF controls/replacement, saved-row/Focus navigation and lyric/title/restoration journeys have independent API-created prerequisites and share a reader-only API-authenticated session, separate from UI login/password tests. The old 120 s journey is four focused cases with 90 s overall PDF/Focus budgets. Actions are bounded at 15 s and navigation at 20 s; no retries or arbitrary sleeps were introduced.
- Running against preview exposed an existing production race: anonymous-session cleanup removed the public account-capability query while registration/recovery was using it. Public `auth-config` is now preserved while private queries are still purged on expiry/logout; two regression tests reproduce the failure and pass with the fix. The saved-Mass browser case also now uses an actual per-choir Planner fixture, rather than a Leader with deletion permission. Its existing no-delete assertion remains unchanged.
- [Browser contract](../frontend/tests/contracts/browser-contract.json) maps the original 37 scenarios to 40 successor scenarios, retaining all four profiles. The simple-mode queue includes the existing Choirmaster-request scenario as additional coverage. Expected skips remain explicit: three simple-only cases in email mode, the disabled email-verification/recovery journey in both modes, and phone rotation on desktop.
- Expected union: **160 email-mode instances and 20 simple-mode instances**, giving **159 passes and 21 documented skips**. The additional case instances come from the four-way reader split and simple-mode Choirmaster coverage; no original viewport/mode instance is removed. The permanently disabled email journey remains an acceptance gap rather than a passing result.
- [Reader assertion contract](../frontend/tests/contracts/reader-assertions.json) records every original assertion and owner. `node scripts/check-reader-assertions.mjs` verifies all **203** survive the split and can write their new owners/locations through `E2E_ASSERTION_MAP`. Update this contract deliberately only when an approved behavior change requires changing an assertion; it is a preservation check, not a line-coverage target.
- The runtime reporter records test IDs, file/title, profile, mode, expected/actual status, duration, retry count and dynamic skip reasons. CI fails on missing/extra cases, unexpected skips or retries. Unique `browser-reports-<profile>` artifacts contain per-mode coverage, blob reports and failure traces/screenshots; the merge job requires all eight reports. The final `checks` job rejects failed, skipped or canceled dependencies.
- Global `@email`/`@simple` tags keep repeated scenarios distinguishable when blob reports merge, following [Playwright’s multi-environment reporting guidance](https://playwright.dev/docs/test-reporters). Test-only Django settings close request connections so concurrently isolated local profiles cannot retain a connection per development-server thread; three checks verify this policy leaves normal settings intact and rejects hosted/production use.
- Seven small runner-gate tests cover all valid profile/mode combinations, dropped cases, unexpected skips, retries, wrong profiles, missing skip reasons, and failure/absence of one aggregate profile. Backend verification passes **461 tests** with real PostgreSQL and migrations. Unit tests retain actual API error/DOM event cases and have passed repeatedly without observed cross-realm failures.

Local generated timing/results are under ignored `.cache/system-tests/`. The two production-race regressions increase the unit suite from 133 to 135; the benchmark above intentionally compares the same earlier 133 cases in both pools. CI Linux timing/memory, total runner minutes and physical Safari/Android results cannot be claimed from Windows emulation. The production persistence harness remains independent and unchanged.

Final local verification:

| Gate | Result |
| --- | --- |
| Current backend suite | 461 passed in 58.15 s, including the three browser-settings guard cases |
| Current frontend suite | Identical 135 case identifiers/statuses passed in both pools; forks 34.71 s, VM threads 15.93 s in the final paired run |
| Complete browser matrix | All eight mode/profile runs passed: 159 passes, 21 documented skips, no retries |
| Four-profile local wall time | 825.8 s (13 min 46 s), plus the 9.6 s checked build; shared-machine CPU contention means this is not a CI timing forecast |
| Merged blob report | 159 expected passes, 21 skips, zero unexpected results and zero flaky tests; all eight blobs accounted for |
| Coverage contracts | All original 37 scenarios mapped to successors; all 203 reader assertions retained; seven reporter/aggregate guard tests passed |
| Build and static checks | Production build/TypeScript, Ruff lint/format, ESLint, Prettier, workflow structure, Git whitespace and 291 documentation links passed |
| Local isolation | Remote database/occupied-port refusals verified; temporary services/databases removed; normal services on 8000/5173 preserved |

The final matrix logs/timings are in `.cache/system-tests/ca27801024e3/`; paired unit reports, backend JUnit and merged-gate results are in `.cache/system-tests/final/`. The merged report is `frontend/playwright-report/index.html`, with machine-readable results at `.cache/browser-merged.json`. Early preview failures revealed the production configuration race and incorrect Planner fixture, which were repaired. An initial four-profile attempt exhausted development-server persistent connections; the local-only per-request connection policy fixed that. The successful matrix above contains neither failure and uses the real database/storage paths for every case.

## Running and inspecting the update

Use `.\dev.cmd check` for the application and coverage-guard checks, and `.\dev.cmd e2e` for the serial local browser matrix. After dot-sourcing `scripts/project.ps1`, pass a focused project/file to `scripts/e2e.ps1 -TestArguments @('performance-review.spec.ts', '--project=mobile')`. Leave PostgreSQL running; the gate owns only ports 8001/5174 and refuses existing services. Default local account flags come from the configured E2E mode; CI explicitly runs email and simple configurations. Local focused runs record `.json` coverage under `frontend/test-results`; mandatory profile/mode completeness is enforced only by `E2E_ENFORCE_COVERAGE=true` with `E2E_PROJECT`.

For the complete matrix with disposable databases, run `.\.venv\Scripts\python.exe scripts/system-browser.py --jobs 2` (up to four profiles concurrently). It builds once and assigns profile-specific frontend ports 5174/5184/5194/5204 and backend ports 8001/8011/8021/8031. Every profile/mode creates and finally drops its own randomized loopback PostgreSQL database. Accounts/uploads are run-scoped; fixture cleanup removes unreferenced hymns/PDFs, while captured email/log files remain ignored for diagnosis. The original database supplies connection credentials only; no existing database is reset. Occupied allocated ports fail before setup. The runner rejects remote database hosts and records individual logs and `timings.json` under a randomized `.cache/system-tests/` directory. `--profiles desktop --modes simple` narrows a development check; the full release contract still requires all eight combinations. The default is serial (`--jobs 1`).

For CI artifacts, inspect `.cache/browser-reports/<profile>-<email|simple>/coverage.json` and the merged HTML report. `node --test scripts/tests/browser-coverage.test.mjs` exercises the reporter and aggregate failures without application services. No hosted database or upload bucket is a test target.

Reader ownership after the split:

| Original responsibility | Current owner |
| --- | --- |
| Multilingual UI creation, metadata, save/reload and Latin search | `Reader form` |
| Standalone PDF rendering/zoom, gestures, rotation, fullscreen restoration and replacement | `Reader PDF` |
| Saved rows/metadata, both Mass Back links, error return, occurrence selection, keyboard and nested PDF fullscreen | `Reader Focus` |
| Multilingual pagination, complete graphemes, zoom/rotation passage retention, long-title sizing, PDF occurrence memory, fallback, wake release and reload | `Reader lyrics` |
| Shared API creation/201 checks | `materials` fixture, consumed independently by the PDF, Focus and lyrics cases |
| Existing phone rotation and responsive-heading scenarios | Their original standalone cases, with all profiles retained |

## Goal and measured baseline

Shorten feedback time while retaining every existing test case, assertion, required account mode and browser profile. Begin with execution changes; preserve the four-profile browser matrix.

| Measurement | Local result | Meaning |
| --- | --- | --- |
| Full backend duration profile | 452 tests passed in 55.02 s | No individual test dominates; actual migration preservation took 2.28 s. |
| Default frontend unit pool | 127 tests passed in 42.68 s | Existing two-worker configuration. |
| `vmThreads` trial | Same 127 tests passed in 16.31 s | About 62% less elapsed time in this local comparison; verify repeatability and CI memory before adoption. |
| Browser inventory | 37 scenarios across desktop, 390px, 360px and 430px profiles | 148 listed instances before runtime skips. One worker currently executes them serially. |
| Large reader journey | About 42 s desktop / 51 s phone in recent runs | Combines form/search, PDFs, Focus, lyrics, layout and restoration; failures can consume its 120 s budget. |

These measurements precede the six new hosted-provisioning tests and six additional hymn-row gesture cases from the review repair. Capture a fresh manifest before changing runners. Measurements are local observations, not CI duration promises.

## 1. Record the coverage contract

- Save discovered test identifiers, account mode, project/profile, expected result and current skip reasons as CI artifacts. Include tests skipped inside test bodies, not just collection-time annotations.
- Map each existing assertion to its owning case before splitting journeys. Track new IDs against the old case so a reduced count cannot silently remove coverage.
- Retain normal/alternate email-enabled account paths and deployed simple-account paths. Explicitly assign mode-specific tests; some password/reset cases cannot run unchanged when recovery is disabled.
- Keep the currently disabled email-verification/recovery browser journey recorded as an existing acceptance gap. Re-enable it before shipping those email features. Physical Safari/Android acceptance remains separate from Chromium emulation.
- Add the repaired gesture cases and hosted CLI forwarding cases to the coverage inventory.

Required coverage groups:

| Group | Required evidence |
| --- | --- |
| Accounts and roles | Signup/login/logout, expiry/password invalidation, verification flags, Choirmaster requests/decisions/reapplication, Leader/Planner/Member permissions, cross-choir denials. |
| Mass planning | Draft autosave/recovery, revisions and concurrent saves, finalize/reopen/delete, usage/history, placement warnings and single insertion after hymn creation. |
| Hymns and PDFs | Private/reviewer visibility, metadata/classifications, raw and gzip bytes, upload limits, corruption, replacement/removal/rollback, conversion races and persistent storage. |
| Reading and gestures | Selected occurrence, Focus/reload/return focus and scroll, short/long swipes, cancellation/multitouch, nested fullscreen, zoom/rotation, multilingual lyric pagination. |
| Responsive/accessibility | All existing viewport combinations, keyboard/context actions, focus restoration, dialogs, wrapping/truncation and overflow. |

## 2. Adopt the measured unit-runner improvement

Change `frontend/vitest.config.ts` to `pool: 'vmThreads'`, retaining `maxWorkers: 2` and per-file isolation. Do not disable isolation or replace jsdom in this step.

Run the same fresh manifest through both pools, repeat for a median duration, and verify all cases pass. Compare peak memory and cross-realm `instanceof` behavior, particularly API errors and DOM event classes. Validate on local Windows and CI Linux. Keep the old pool as the fallback if a runtime-specific incompatibility appears.

Acceptance: identical discovered cases/results, no additional skips/retries, and a reproducible elapsed-time improvement within the runner's memory budget. [Vitest performance guidance](https://vitest.dev/guide/improving-performance).

## 3. Parallelize browser profiles with isolated databases

Split the browser CI work in `.github/workflows/ci.yml` into four independent jobs for `desktop`, `mobile`, `mobile-360`, and `mobile-430`. Each job runs its assigned project and retains every applicable scenario in both required account configurations.

- Give each job its own PostgreSQL service/database, application services, randomized fixture accounts, captured-email directory and upload directory. Keep one browser worker within each job initially.
- Do not turn on shared-database multi-worker execution: classifications, Admin queues, account passwords/default choirs and fixture counts currently have shared state. Separate accounts alone do not isolate global Admin queues or taxonomy changes.
- Use unique artifact names per profile and account mode. Merge reports into one result and require every profile job to pass the final CI gate. Keep traces/screenshots for failures and clean up owned services/data on cancellation.
- Hosted database/storage are never test targets. Existing occupied local ports must still fail safely; local parallel execution would need explicit unique ports and databases before it is enabled.

Acceptance: the union of job manifests exactly covers the original browser matrix and mode-specific cases, with no missing or duplicated required instances. A deliberately failing profile must fail the aggregate gate. Measure total elapsed time and CI runner minutes; do not promise a fourfold improvement because startup, imbalance and runner quotas remain.

[Playwright sharding and report merging](https://playwright.dev/docs/test-sharding).

## 4. Reduce setup repetition while retaining UI journeys

Create shared browser fixtures for role-specific authentication and API-created prerequisites. Use saved authenticated state for tests whose purpose is unrelated to signing in. Keep dedicated UI signup/login/password/session-expiry tests using separate accounts, so session invalidation cannot break other fixtures.

Prepare hymns and Masses through the real API when they are prerequisites for a reading/layout test. Preserve complete UI creation and draft-to-hymn journeys as their own cases. Preserve session storage/active-choir initialization where a case depends on it.

Build/copy PDF assets once per job and evaluate using the built frontend with the same-origin preview proxy. Keep the production Django/container serving test as a separate release gate. Verify that using preview does not remove any behavior currently exercised by browser tests.

Consolidate the separate password preflight invocation: those cases already run in the main browser suite. Preserve them in the manifest while eliminating the extra fixture/service startup. Restart services when switching account feature flags; that mode boundary cannot be ignored.

[Playwright authentication isolation](https://playwright.dev/docs/auth).

## 5. Split long journeys and shorten failed runs

Split the large `performance-review.spec.ts` journey into focused form/search, PDF controls/integrity, Focus navigation/restoration, lyric pagination and responsive-title cases. Use API prerequisites from step 4. Apply the same approach to large Mass editor journeys when measurements justify it.

Preserve every assertion and cross-feature sequence that requires continuity, such as returning from nested PDF fullscreen to the same Focus page. Do not replace required sequences with unrelated snapshots.

Start with bounded action timeouts around 10–15 s and measured navigation limits. Keep suitable overall workflow budgets and the existing explicit condition waits. This reduces time spent waiting for missing controls on failure; it does not itself make passing tests faster. Do not add arbitrary sleeps, force clicks or automatic retries to hide race conditions. [Playwright timeout controls](https://playwright.dev/docs/test-timeouts).

## 6. Improve CI orchestration and local feedback

- Run independent backend and frontend checks in separate jobs; keep the existing production-image/PDF persistence job. Require all checks and browser profiles before release.
- Cache dependency downloads using locked dependency files. Share a verified frontend build artifact where useful. Avoid repeating the TypeScript build check within the same job when a preceding required step has already checked identical sources.
- During development, run the focused regression tests first, then the affected feature group. Run the complete required matrix once the change is stable and before release. Documentation-only follow-ups do not require repeating unchanged browser journeys.
- Backend DB setup was about 2 s in the duration profile, so database reuse is a secondary optimization. Consider local `--reuse-db` with a schema-aware recreation policy. Keep fresh-database migration checks, actual PostgreSQL locking/concurrency tests and production password-hasher acceptance. Do not substitute SQLite or disable migrations/transactions globally.

[pytest-django database reuse and isolation](https://pytest-django.readthedocs.io/en/latest/database.html).

## Completion criteria

1. All current and new cases/assertions are accounted for by the coverage manifest; no increased skip/retry count or weakened assertions.
2. Every required account mode and all four existing browser profiles pass. Aggregate CI fails if any required job fails.
3. Repeated runs show lower median wall time without new order dependence, fixture collisions, excessive memory, orphan services or leaked test objects.
4. Production image/PDF persistence, migration preservation and physical-device acceptance remain explicit release requirements.
5. Record before/after timing, case inventories and environment details in this document. Commit/push/deployment require the owner's separate authorization.
