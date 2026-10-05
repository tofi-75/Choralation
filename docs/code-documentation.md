# Code documentation and review standard

**Applies from M1 onward**, and to the M0 verification helper. This document implements the user's request for well-documented code.

## What must be documented

- Put a short module header/docstring on services, selectors, permission policies, and infrastructure helpers describing their responsibility and boundaries.
- Document public business functions with inputs, output, preconditions, permission/state expectations, side effects, transaction ownership, and errors where relevant. Give Python type hints and TypeScript types for domain contracts; avoid `any` as a substitute.
- Explain **why** near non-obvious code: filtered counts, retained inactive IDs, locking order, revision checks, CSRF rotation, deterministic ties, and date cutoffs.
- Use short JSDoc comments on exported API functions, custom hooks with save/caching behavior, and complex React components. Explain user-visible behavior rather than narrating JSX.
- Describe model constraints, deletion semantics, and nullable/default behavior in model/service documentation. Migrations need a rationale when they contain data transforms or unusual operations.
- Keep API/OpenAPI response schemas, examples, query semantics, errors, and authorization aligned with the actual implementation.
- Explain configuration/environment variables in `.env.example` without real secrets; document executable commands in README only after verification.

## Example service documentation shape

The following is illustrative documentation, not a placeholder function to add to the backend:

```python
"""Atomically replace a draft program using the caller's expected revision.

Requires a Planner/Admin actor. Locks the Mass row before validating status
and revision. Existing selection IDs must belong to this Mass; retained
inactive links are allowed, but new inactive links are rejected.

Returns the committed program and revision. No partial write occurs on a
validation error. Raises a state conflict for finalized Masses and a
precondition error when the caller's revision is stale.
"""
```

Specify whether a service opens its own transaction or requires one; never leave that decision to callers' assumptions. Keep related mutations on a consistent lock order to avoid deadlocks.

## Review expectations

Every implementation change should explain its user outcome, important design choices, validation evidence, and limitations. A reviewer should be able to find the controlling contract and understand failure paths from the code.

Keep comments concise and correct after refactoring. Prefer explicit names and small functions over long commentary. Do not add comments that simply restate assignments, decorative banners, copied specification blocks in every file, undocumented magic weights, or unowned TODOs for required current-milestone work.

Update architecture/API documentation in the same change when behavior changes. Tests are executable evidence for the documented contract; documentation must not claim that a proposed API or test already exists.

## Project-only tooling

Future virtual environments, dependency caches, test output, Playwright browsers, and generated OpenAPI artifacts must stay under the project folder. Helpers must validate their target paths before writes/deletes. Avoid global installations, user-profile configuration edits, and background services during preparation. See [architecture.md](architecture.md) for the current scope boundary.
