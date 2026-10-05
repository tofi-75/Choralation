# API contract — implementation baseline

**Date:** October 6, 2026. **Status:** M0 contract; endpoints are not implemented.  
**Owner:** Implementation owner. **Base:** `/api/v1/`.  
Changes to this contract must update [architecture decisions](architecture.md), frontend types, OpenAPI schemas, and relevant tests together.

## 1. Common conventions

Use JSON, trailing-slash routes, positive integer relational IDs, ISO `YYYY-MM-DD` dates, UTC ISO timestamps, and zero-based selection positions. Read category relationships as nested `{id, name, slug, is_active, display_order}` objects; write relationships using `_id`/`_ids` fields. Never use seed IDs as business constants.

Optional metadata reads as null when empty; lists read as `[]`, never null. Unknown write fields are rejected with 400 to catch misspellings. PATCH changes supplied fields only. Server-owned fields (`id`, audit fields, usage, status, revision, finalization timestamp) cannot be written directly. Null cannot remove required title/language/date fields.

Paginated collections return `{count, next, previous, results}`. `next`/`previous` are URLs or null. `page` starts at 1, `page_size` defaults to 25 and accepts only 25/50/100. Invalid sizes return 400; nonexistent pages return 404. Query parameters with invalid format/value return 400, not silently ignored.

App reads require authentication, except CSRF bootstrap, login, and infrastructure liveness. Authenticated Viewer reads all team data. Permissions in [ADR-002](architecture.md) apply to each write action. Protected API schema/docs require authenticated access in production.

## 2. Sessions and CSRF — M1

| Method/path | Result |
| --- | --- |
| `GET auth/csrf/` | 200 `{csrf_token: "..."}` and CSRF cookie; callable anonymously, `Cache-Control: no-store` |
| `POST auth/login/` | JSON `{username, password}` with CSRF header/cookie; 200 current-user object and session cookie |
| `GET auth/me/` | 200 `{id, username, role}`; anonymous request fails |
| `POST auth/logout/` | Requires CSRF, clears current session; 204; repeating safely remains 204 |

Client sends same-origin credentials and `X-CSRFToken` on unsafe requests. Fetch a fresh CSRF bootstrap after login because Django rotates the token. Use Django's explicit CSRF protection on the anonymous login route, not only DRF SessionAuthentication. Never send passwords in URLs or logs. Invalid credentials return a generic 400 code `invalid_credentials`; missing/invalid CSRF returns 403 code `csrf_failed`.

Use 403 `not_authenticated` for anonymous protected requests consistently with DRF session authentication; the client distinguishes it from 403 `permission_denied` and redirects to login only for the former. Session expiry must retain unsaved local form content where the mounted app can do so. Reload/offline recovery is not promised.

## 3. Predictable errors

```json
{
  "detail": "Validation failed.",
  "code": "validation_error",
  "errors": {"title": ["This field is required."]}
}
```

Nested field errors use DRF-style arrays/objects, such as `errors.selections[1].hymn_id`. Nonfield errors use `non_field_errors`. All ordinary API errors have `detail`, `code`, and `errors` (empty object if none). CSRF failures must use the same shape. Production 500 responses include a generic message/request identifier and no traceback; proxy/network failures may not be JSON and the client must handle that safely.

| HTTP | Code | Client behavior |
| --- | --- | --- |
| 400 | `validation_error`, `invalid_credentials` | Field/general feedback; preserve input |
| 403 | `not_authenticated` | Login transition |
| 403 | `permission_denied`, `csrf_failed` | Explain access/CSRF failure; no blind mutation retry |
| 404 | `not_found` | Missing resource/page state |
| 409 | `mass_finalized`, `referenced_record` | Explain state or protected reference; no write |
| 412 | `revision_conflict` | Retain edits; fetch/review server version |
| 428 | `revision_required` | Client contract failure; fetch current revision |
| 500 | `server_error` | Retry action; never claim saved |

Unrecognized/malformed revision headers return 400 `validation_error`. Don't expose reference information to a user who cannot read the referenced resource.

## 4. Hymns — M2 with usage in M4

`GET/POST hymns/`, `GET/PATCH/DELETE hymns/{id}/`, `GET hymns/{id}/usage/`.

POST/PATCH require Planner/Admin; active-state changes and DELETE require Admin. DELETE succeeds with 204 only if no selections reference the hymn, including drafts; otherwise 409 `referenced_record`. PATCH `is_active=false` is the explicit deactivation route, with UI confirmation. POST defaults `is_active=true`; a Planner cannot set it false.

Write example (illustrative IDs):

```json
{
  "title": "Example Hymn",
  "language_id": 1,
  "genre_ids": [2],
  "season_ids": [6],
  "placement_ids": [8, 9],
  "tag_ids": [],
  "is_season_neutral": false,
  "estimated_duration_minutes": "3.50"
}
```

Accept every optional Hymn field listed in source section 8. Duration reads/writes as a decimal string to avoid float ambiguity. Read responses include nested categories, optional metadata, active/neutral state, and audit timestamps; M4 adds `usage_count` and nullable `last_used_date`. Do not advertise usage fields as available before M4. Usage endpoint returns paginated `{mass: {id, date, title, status}, placement, selection_id, position, notes}` occurrences from finalized Masses only, ordered descending date/Mass ID then placement display order/position/selection ID.

### Library query contract

| Query | Meaning |
| --- | --- |
| `q` | Trimmed case-insensitive substring across required text/tag fields; blank means no search |
| `genres`, `seasons`, `placements`, `languages`, `tags` | Comma-separated positive IDs; OR within field, AND between fields; duplicate IDs normalized |
| `is_active` | `true`/`false`; omit for default true; `all` intentionally supported for Admin inactive inspection and readable by other roles |
| `used_after`, `used_before` | Inclusive finalized occurrence bounds; one occurrence satisfies both when supplied |
| `not_used_since` | No finalized occurrence on/after date, including never-used |
| `never_used` | `true` means no global finalized occurrences; `false` means at least one; omit means no usage predicate |
| `ordering` | One documented value below |
| `page`, `page_size` | Pagination conventions above |

Unknown IDs within a supplied category filter return 400. Inactive existing IDs can be used to inspect old records. Empty list parameters are errors; omit them instead. Impossible date ranges return 400. Contradictory valid predicates yield zero results, not a silent change to user intent. Usage query parameters are introduced in M4; before then return 400 explaining unavailability.

Ordering values: `title` (default), `recently_used`, `least_recently_used`, `most_used`, `least_used`, `newest_added`. Recent sorts place never-used last/first respectively; count sorts use zero for never-used. For most/least-used sort by count descending/ascending, then case-insensitive title and ID. Newest sorts creation timestamp descending then ID descending. Title sorts case-insensitive database text then ID; no browser-dependent reordering of a paginated result. Global usage includes future finalized Masses, as documented in ADR-006.

Examples: `?placements=8&seasons=6`, `?placements=8&languages=1,3`, `?q=mary&placements=11`, `?not_used_since=2026-04-01&never_used=false`.

## 5. Categories — M2 API, M6 complete React Settings

Collections: `genres/`, `liturgical-seasons/`, `mass-placements/`, `languages/`, `tags/`.

All support GET/POST and detail GET/PATCH/DELETE. Read is authenticated; writes Admin-only. `is_active` defaults true, and `is_active=all` includes inactive values. Settings uses all records. Seed labels never control behavior.

POST accepts `{name, description?, display_order?, is_active?}`. Slug is generated server-side and is not editable. PATCH supports the same fields. Reject negative order, blank names, and case-insensitive duplicates. Reads include the common source category fields. Detail includes `reference_counts` by direct reference kind for impact feedback; do not conflate hymn associations with usage occurrences.

`POST {collection}/reorder/` accepts `{ordered_ids: [...]}` containing every record in that category type exactly once, including inactive records. Lock rows in stable ID order, validate membership/uniqueness, assign contiguous zero-based order, and commit atomically. Return 200 `{results: [...]}` with the new order. Full-category optimistic concurrency is deferred: the last valid order update wins, but updates cannot be partial. The small-team pilot must confirm this is acceptable.

Category DELETE returns 204 for unreferenced rows only; check M2M links, Hymn language, Mass season, and selection placement references. Otherwise return 409 `referenced_record` with a useful deactivation message. Deactivate via PATCH and preserve old references.

## 6. Masses and revision protocol — M3/M4

`GET/POST masses/`, `GET/PATCH/DELETE masses/{id}/`.

POST accepts `{date, title?, liturgical_season_id?, notes?}`; status/revision are server-owned. Title defaults to the source's `Sunday Mass — <formatted date>` even when the date is not Sunday; the user can supply a special-Mass title. Do not require Sunday or a season. On update an unchanged inactive season is retainable; a new inactive season is rejected.

Reads include ID, source Mass fields, `revision`, `selection_count`, a saved `program` with ordered rows, and `warnings`. Lists may provide a compact preview instead of the entire program, documented separately in the implemented OpenAPI schema. Read detail and mutation responses include `X-Mass-Revision: 7`, matching the numeric `revision` field. Writes submit `X-Expected-Mass-Revision: 7`. This precondition protects Mass-owned metadata/program/state; live hymn/category labels and warnings do not advance a Mass revision. Explicit headers avoid incorrectly treating the aggregate version as a strong HTTP representation ETag. Application data responses use `Cache-Control: no-store`; TanStack Query handles in-memory caching.

List queries: inclusive `from`/`to`, `status=draft|finalized`, `season=<single ID>`, `q` across title/notes, pagination, newest-date/Mass-ID first. A draft appears in planning/history lists when requested but never in usage calculations.

PATCH accepts editable metadata only and requires `X-Expected-Mass-Revision`. Delete requires Admin, draft state, and that same header; 204. Finalized PATCH/DELETE returns 409 when the revision is current. Missing revision returns 428; stale returns 412 with the current revision and `X-Mass-Revision`. The client must refetch the actual record for conflict review. Parse the header as a positive integer; reject arrays, wildcard, or malformed values. Authenticate/authorize first, then check revision, then state, before writes.

### Atomic program update

`PUT masses/{id}/program/`, requires Planner/Admin, draft state, and current `X-Expected-Mass-Revision`. Example:

```json
{
  "selections": [
    {"id": 120, "placement_id": 8, "hymn_id": 17, "position": 0, "notes": null},
    {"placement_id": 8, "hymn_id": 41, "position": 1, "notes": "Second Communion hymn"}
  ]
}
```

Omitted existing rows are removed. IDs, when supplied, belong to this Mass and appear only once; new rows omit ID. Validate all entries before writing. Require distinct contiguous positions per placement; reject duplicates/gaps rather than silently changing the caller's order. Return 200 `{mass_id, revision, selections, warnings}` with persisted IDs and current `X-Mass-Revision`. Full empty list is a valid draft program. Replaying the committed representation with existing IDs is a no-op; repeating a request with an old revision gets 412.

Retained inactive selections are allowed by identity; new inactive hymn/placement links are 400 field errors. Category suitability and repeat use are warnings only, returned as `{code, hymn_id, selection_ids, placement_id?, facts}` objects. Do not reject active manual selections because they lack a season/placement classification.

### Lifecycle — M4

`POST masses/{id}/finalize/` and `POST masses/{id}/reopen/` take `{}` and current `X-Expected-Mass-Revision`, return full Mass detail and `X-Mass-Revision`. Finalize requires Planner/Admin; reopen requires Admin. Current-state repeat calls return 200 without changing revision/timestamp. Stale calls return 412 even if the action was already performed. Finalization sets `finalized_at`; reopening clears it. No selections are copied or deleted. History reflects current status immediately.

Finalization checks existing committed data, not browser-only edits. Empty placements are valid; UI review warns about an entirely empty program and retained inactive rows. This contract does not add a hard placement-completion requirement.

## 7. Recommendations — M5

`GET masses/{id}/recommendations/?placement_id=<id>&genre_ids=1,2&language_ids=1&limit=20`.

Authenticated read; placement is required and active. Invalid IDs/limits return 400; nonexistent target Mass returns 404. Limit accepts 1–100, defaults to 20. Genre/language filters use OR within, AND between. No pagination. An empty eligible set returns 200 with empty results.

```json
{
  "history_context": {"reference_date": "2026-04-19", "finalized_before": "2026-04-19"},
  "notices": [],
  "results": [
    {
      "hymn": {"id": 41, "title": "Old Communion Hymn", "language": {"id": 2, "name": "English"}},
      "score": 95,
      "reasons": ["Suitable for Communion", "Suitable for Easter", "Last selected 105 days before this Mass"],
      "usage_count": 2,
      "last_used_date": "2026-01-04",
      "already_selected": false
    }
  ]
}
```

`usage_count`/`last_used_date` here are ranking-context values, not the global Hymn library values. Use explanatory text such as `Never selected before this Mass` when the distinction matters. UI cards may use friendly relative wording for upcoming planning while keeping target date evident. No selected season returns notice `season_unavailable`; do not infer a season from the date.

Score, eligibility, tie-breaks, recency boundaries, and warnings are defined in ADR-007 and the development plan. Return the categories necessary for cards without per-card fetches. Keep numeric score for debugging/contract consistency; reasons are the main UI explanation.

## 8. Dashboard and operational routes — M7

Use `GET dashboard/` to compose `{upcoming_mass, recent_masses, recently_used_hymns, season_suggestions}` with bounded lists. Upcoming Mass is the first on/after team-local today ordered ascending date/ID; it may be draft or finalized. Return null/empty arrays when context is absent. Suggestions derive from the existing ranking service for the upcoming Mass's placements, deduplicate hymns, and remain empty when no season is selected. No automatic calendar engine.

Read-only `GET /health/live/` confirms the process; `GET /health/ready/` checks essential database connectivity. Return generic status only, not settings/secrets. These operational paths are outside the application API namespace; define their network exposure at deployment.

## 9. Frontend invalidation and contract evidence

Use query keys `["hymns", filters]`, `["hymn", id]`, `["hymn-usage", id, filters]`, `["masses", filters]`, `["mass", id]`, `["recommendations", massId, placementId, filters]`, `["categories", kind, filters]`, and `["dashboard"]`.

Program mutation refreshes Mass lists/detail, affected recommendations, and dashboard. Finalize/reopen additionally refreshes affected hymn details, usage lists, all usage-filtered library variants, and history. Category/hymn edits refresh dependent selectors/cards without losing unsaved form data. Request hooks must include filter/season changes in cache keys or invalidation.

M1 introduces validated OpenAPI generation; each endpoint arrives with its milestone and adds examples/errors/permissions to that schema. This document is the M0 contract, not a replacement for tested runtime behavior. Acceptance cases and exact fictional expectations are in [acceptance.md](acceptance.md).
