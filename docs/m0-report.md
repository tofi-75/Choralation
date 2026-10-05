# M0 completion report

**Completed engineering preparation:** October 6, 2026.  
**Owner:** Implementation owner (Codex, this project/chat).  
**Next milestone:** M1 — Running authenticated application.

## Delivered

| M0 package | Result | Evidence |
| --- | --- | --- |
| M0.1 Requirement map | Complete planning ownership for all 79 sections; optional scope explicitly deferred | [Plan](../DEVELOPMENT_PLAN.md), [machine-readable map](requirements.json), [backlog](backlog.md) |
| M0.2 Contracts | Resolved roles, active/history behavior, atomic save/revision conflicts, lifecycle, and separate usage contexts | [Architecture](architecture.md), [API](api.md) |
| M0.3 Architecture/dependencies | Built-in Django User/groups, same-origin sessions/CSRF, PostgreSQL/Windows boundary, exact verified direct selections | [Dependencies](dependencies.md), [version data](dependency-baseline.json) |
| M0.4 UX walkthrough | Annotated library/form/planner/picker/settings sketches, mobile/keyboard/failure states, coordinator script | [UX walkthrough](ux-walkthrough.md) |
| M0.5 Acceptance fixtures | Fictional deterministic hymns/Masses, duplicate/inactive/Unicode/history edge cases, exact score/filter expectations | [Acceptance guide](acceptance.md), [fixture](fixtures/m0-scenarios.json) |
| Documentation standard | Requirements for docstrings, types, transaction rationale, API/config docs, and review evidence | [Code documentation](code-documentation.md) |
| Static verification | Read-only Node helper using standard library only | [Verifier](../scripts/verify-m0.mjs) |

## Important resolved choices

- Viewer/Planner/Admin policies are backend-enforced; ungrouped authenticated users default to Viewer; staff status alone does not grant app Admin.
- Future finalized plans remain in global usage per the source, with scheduled wording. Ranking history includes only finalized dates strictly before the target Mass.
- Mass writes use explicit aggregate revision headers, not HTTP ETags whose representation guarantee would be invalidated by independently changing labels/warnings.
- Historical references are protected, while inactive retained rows remain visible/editable in their existing context.
- Current TypeScript 7.0.2 was not selected because the lint tooling inspected supports below 6.1; TypeScript 6.0.3 resolves that mismatch.
- Seed reruns preserve existing edited defaults; intentionally deleting a default and rerunning seed recreates it. Deactivation is the durable way to keep it unavailable.

## Validation evidence

Run from project root:

```powershell
node .\scripts\verify-m0.mjs
```

The helper checks project-local Markdown links, 79-section ownership coverage, exact dependency selection shape, fixture identity/references/order, finalized-only global usage examples, target-date scores/eligibility, recency boundaries, and literal combined-filter membership. It prints the source SHA-256 for comparison.

The authoritative specification was unchanged. Its SHA-256 before M0 work was:

```text
53f4f71d36f946b5cf9c91f6aced925bdeb5b2b561eead9e29a20b86890d9d00
```

The verifier was executed successfully on October 6, 2026 using Node 24.19.0, with these results:

- 55 local documentation links resolved across 11 Markdown files.
- All 79 source sections mapped to owned milestone gates.
- 10 Python and 26 npm exact direct-version selections passed static shape checks; their registry metadata had been inspected separately.
- Eight fictional hymns, seven Masses, and eight selection identities passed reference/order checks.
- Four global usage expectations, five score expectations, three exclusions, and eleven recency boundaries matched their documented rules.
- Four literal filter result sets matched their expected membership.
- The source checksum matched the pre-work value above.

These are static M0 checks, not passing application tests. Editing this evidence paragraph adds no links and does not change the counted fixtures; rerun the verifier to confirm the final document set.

## Scope and honest limits

All created/edited files are inside the project folder. No external project/profile configuration, global runtime, browser installation, virtual environment, database, container, or deployment was changed. Package metadata requests were read-only; they did not install dependencies.

M0 has no production application code. Python/npm/Docker were not found on PATH; Node 24.19.0 was available. The baseline selects Node 24.21.0, so M1 must verify/use the chosen runtime without changing files outside the permitted folder.

No dependency installation, transitive lock resolution, migration, API test, UI test, performance measurement, or real coordinator session has occurred. Those are explicit later-milestone gates. Full coordinator approval of sketches remains pending; M0's engineering walkthrough was checked against the specification, not endorsed by a human music coordinator.

## M1 handoff

Start with M1.1 in [backlog.md](backlog.md): establish project-local tooling, generate real dependency locks, scaffold Django/React/PostgreSQL, and document verified commands. Then implement explicit CSRF/session authentication and the protected shell. Read [code-documentation.md](code-documentation.md) before adding application code.

No unresolved architecture decision blocks M1. External runtime availability and coordinator feedback are visible follow-up items; neither is disguised as completed execution evidence.
