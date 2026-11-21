# System test optimization plan

Planned November 21, 2026. This is an implementation plan; the test runner and CI configuration have not been changed by the regression repair. No commit, push or deployment is included.

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
