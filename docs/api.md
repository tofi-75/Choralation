# API contract — implementation baseline

**Date:** October 8, 2026. **Status:** M1 sessions, M2 hymn/category endpoints, M3 draft Mass/program endpoints and Maronite calendar suggestions are implemented. M4 lifecycle, usage and saved history endpoints are implemented and verified; physical-phone acceptance remains pending. Recommendations (M5) and dashboard (M7) remain planned.
**Owner:** Implementation owner. **Base:** `/api/v1/`.  
Changes to this contract must update [architecture decisions](architecture.md), frontend types, OpenAPI schemas, and relevant tests together.

## Maronite calendar suggestions (October 8 review)

Authenticated `GET /api/v1/calendar/maronite/?date=YYYY-MM-DD` returns `date`, `calendar: "maronite"`, `season_slug`, `season_name`, active `season_id` (nullable), `day_title` (nullable), `source` (`evangelizo` or `local`) and `source_url`. Invalid dates/years outside 1900–2199 return 400. This read-only endpoint does not alter saved Masses/categories. Public-feed mapping and local fallback boundaries are documented in [calendar notes](calendar.md); explicit manual season selection remains available.

## 1. Common conventions

Use JSON, trailing-slash routes, positive integer relational IDs, ISO `YYYY-MM-DD` dates, UTC ISO timestamps, and zero-based selection positions. Read category relationships as nested `{id, name, slug, is_active, display_order}` objects; write relationships using `_id`/`_ids` fields. Never use seed IDs as business constants.

Optional metadata reads as null when empty; lists read as `[]`, never null. Unknown write fields are rejected with 400 to catch misspellings. PATCH changes supplied fields only. Server-owned fields (`id`, audit fields, usage, status, revision, finalization timestamp) cannot be written directly. Null cannot remove required title/language/date fields.

Paginated hymn collections return `{count, next, previous, results}`. `next`/`previous` are URLs or null. `page` starts at 1, `page_size` defaults to 25 and accepts only 25/50/100. Invalid sizes return 400; nonexistent pages return 404. Small category collections return unpaginated arrays. Unknown, repeated, or invalid query parameters return 400, not silently ignored.

App reads require authentication, except CSRF bootstrap, login, and infrastructure health checks. Authenticated Viewer reads all team data. Permissions in [ADR-002](architecture.md) apply to each write action. The implemented `GET /api/v1/schema/` requires authentication in development and production and returns JSON OpenAPI. No interactive docs route is exposed yet.

## 2. Sessions and CSRF — M1

| Method/path | Result |
| --- | --- |
| `GET auth/csrf/` | 200 `{csrf_token: "..."}` and CSRF cookie; callable anonymously, `Cache-Control: no-store` |
| `POST auth/login/` | JSON `{username, password}` with CSRF header/cookie; 200 current-user object and session cookie |
| `GET auth/me/` | 200 `{id, username, role}`; anonymous request fails |
| `POST auth/logout/` | Requires CSRF, clears current session; 204; repeating safely remains 204 |

Only `{}` or an empty body is accepted by logout; unknown login/logout fields return 400. Identity reads return `Cache-Control: no-store`. Passwords use Django validation and hashing during provisioning. Superusers resolve to Admin; otherwise group precedence is Admin, Planner, Viewer, then ungrouped Viewer. Django staff status alone never grants application Admin privileges.

Infrastructure endpoints are `GET /health/live/` (process liveness) and `GET /health/ready/` (database connectivity). Readiness returns generic 503 when unavailable; neither exposes credentials or database details. Readiness does not check migration drift; run the separate migration/check commands before starting the app. Development uses Vite; hosted production serves the built frontend and API through Django at one origin. Internal health probes bypass the HTTPS redirect so database failures return 503, not a healthy redirect.

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

Implemented: `GET/POST hymns/`, `GET/PATCH/DELETE hymns/{id}/`. PUT is unsupported. `GET hymns/{id}/usage/` is implemented in M4, with the same authenticated read policy.

The implemented M1 review adds `is_polyphonic` (default false), ordered `voices` (default `[]`), and an optional private `sheet_music_pdf` attachment. Voice names are trimmed, nonblank, at most 80 characters, and unique ignoring case; at most 32 names are accepted. Enabling polyphony permits adding names without requiring a particular voice arrangement. PATCH replaces the voice list only when supplied. Disabling polyphony with saved voices requires explicitly supplying `voices: []`; omission never silently discards them.

PDF uploads use `multipart/form-data` on the same POST/PATCH routes: `data` is the JSON metadata object serialized as text, and `sheet_music_pdf` is one file. The browser must set the multipart boundary; JSON writes remain supported when no file is uploaded. Unknown or repeated envelope parts fail with 400. Accept a nonempty `.pdf` file up to 10 MB, with PDF header/EOF framing. File errors appear under `errors.sheet_music_pdf`, and a failed save leaves prior metadata/attachment intact. PATCH `remove_sheet_music_pdf: true` removes an existing attachment; removal and replacement cannot be requested together. Existing sheet-music URL metadata remains independent.

Reads return `sheet_music_pdf: null` or `{name, url}`. The URL is the same-origin authenticated `GET hymns/{id}/sheet-music/` endpoint, available to every logged-in role, returning an `application/pdf` attachment with `nosniff`. Missing attachment/file returns 404; anonymous reads fail. Admins/Planners can upload, replace, or remove a PDF; Viewers cannot. Internal storage keys and paths are never returned by this API.

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

Accept every optional Hymn field listed in source section 8. Required fields are `title`, `language_id`, and nonempty `placement_ids`; nonneutral hymns additionally require `season_ids`. Genres/tags are optional. New links require active categories; unchanged inactive links are retainable. Changing a placement set requires at least one active placement. PATCH omissions preserve stored metadata and relationships; duplicate relationship IDs normalize to a set.

Text limits: title/alternate title/composer/arranger/source 255 characters; first line 500; hymnal number 100; default key 50; each URL 1000. Notes have no application length limit. Blank optional text normalizes to null; internal notes line breaks are retained. Audio and sheet-music URLs accept HTTP/HTTPS only. Duration is nullable, positive, at most `9999.99`, with up to two decimal places; reads return a decimal string.

Read responses include nested categories, all optional metadata, active/neutral state, audit timestamps, and nullable numeric `created_by`/`updated_by` IDs. Title is deliberately not unique. M4 reads include integer `usage_count` and nullable `last_used_date`, derived globally from finalized selection occurrences. The usage endpoint accepts `from`/`to` (inclusive Mass dates), `season`, `q` (Mass title/notes) and pagination; it always excludes drafts, rejects a status parameter, and returns paginated `{mass: {id, date, title, status}, placement, selection_id, position, notes}` finalized occurrences, ordered descending date/Mass ID then placement display order/position/selection ID.

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
| `preferred_season` | Optional existing positive season ID; season-linked and neutral hymns first, then other results, retaining the selected ordering within both groups. Ordering only; does not broaden literal filters. |
| `page`, `page_size` | Pagination conventions above |

Unknown IDs within a supplied category filter return 400. Inactive existing IDs can be used to inspect old records. Empty list parameters are errors; omit them instead. Impossible date ranges return 400. Contradictory valid predicates yield zero results, not a silent change to user intent. Usage query parameters are implemented in M4 with strict date/Boolean validation; unknown or repeated parameters still return 400.

M2 ordering values are `title` (default) and `newest_added`. The October 10 picker review adds ascending/descending column ordering: `title`, `language`, `seasons`, `genres`, `tags`, `key`, `duration`, `voices`, each accepting a `-` prefix for descending. Duration sorts numerically, voices sort the displayed text rather than JSON-array length, category columns sort the complete alphabetically joined labels through isolated scalar subqueries, and missing nullable values follow populated values in either direction. Equal values break ties by case-insensitive title then ID. Neutral season labels sort as “Any season”. With `preferred_season`, suitability remains the leading group, then the column sorts within that group, all before pagination. Newest sorts creation timestamp descending then ID descending. Title sorts case-insensitive database text then ID; no browser-dependent reordering of a paginated result. M4 also implements `recently_used`, `least_recently_used`, `most_used`, and `least_used`. Recent sorts place never-used last/first respectively; count sorts use zero for never-used and break ties by case-insensitive title then ID. Global usage includes future finalized Masses as documented in ADR-006.

Examples: `?placements=8&seasons=6`, `?placements=8&languages=1,3`, `?q=mary&placements=11`, `?not_used_since=2026-04-01&never_used=false`.

## 5. Categories — M2 API, M6 complete React Settings

Collections: `genres/`, `liturgical-seasons/`, `mass-placements/`, `languages/`, `tags/`.

All support GET/POST and detail GET/PATCH/DELETE; PUT is unsupported. Read is authenticated; writes Admin-only. The only category list parameter is `is_active=true|false|all`, default true. Lists are unpaginated arrays sorted by display order, then ID. Settings uses all records. Seed labels never control behavior.

POST accepts `{name, description?, display_order?, is_active?}`; name is trimmed and limited to 150 characters. Slug is generated server-side and is not editable. PATCH supports the same fields. Reject negative order, blank names, and case-insensitive trimmed duplicates. Reads include all common source category fields. Detail and write responses include `reference_counts` by direct reference kind (currently `hymns`) for impact feedback; do not conflate hymn associations with usage occurrences.

`POST {collection}/reorder/` accepts `{ordered_ids: [...]}` containing every record in that category type exactly once, including inactive records. Lock rows in stable ID order, validate membership/uniqueness, assign contiguous zero-based order, and commit atomically. Return 200 `{results: [...]}` with the new order. Full-category optimistic concurrency is deferred: the last valid order update wins, but updates cannot be partial. The small-team pilot must confirm this is acceptable.

Category DELETE returns 204 for unreferenced rows only; check M2M links, Hymn language, Mass season, and selection placement references. Otherwise return 409 `referenced_record` with a useful deactivation message. Deactivate via PATCH and preserve old references.

## 6. Masses and revision protocol — M3/M4

`GET/POST masses/`, `GET/PATCH/DELETE masses/{id}/`.

M3 implements these routes and `PUT masses/{id}/program/`. Mass collection responses are paginated summaries: metadata, nested season, audit fields, revision, and `selection_count`; they omit program rows/warnings. Detail and create/PATCH responses include the entire program with nested hymn/placement records and warnings. PUT returns the program envelope below. Detail/POST/PATCH/PUT success responses include `X-Mass-Revision`. A 412 response includes numeric `current_revision` and the same header. M4 adds lifecycle routes and saved history below. Django admin permits inspection only, so no internal edit/delete form bypasses revision checks.

POST accepts `{date, title?, liturgical_season_id?, notes?}`; status/revision are server-owned. Title defaults to the source's `Sunday Mass — <formatted date>` even when the date is not Sunday; the user can supply a special-Mass title. Do not require Sunday or a season. On update an unchanged inactive season is retainable; a new inactive season is rejected.

Reads include ID, source Mass fields, `revision`, `selection_count`, a saved `program` with ordered rows, and `warnings`. Lists may provide a compact preview instead of the entire program, documented separately in the implemented OpenAPI schema. Read detail and mutation responses include `X-Mass-Revision: 7`, matching the numeric `revision` field. Writes submit `X-Expected-Mass-Revision: 7`. This precondition protects Mass-owned metadata/program/state; live hymn/category labels and warnings do not advance a Mass revision. Explicit headers avoid incorrectly treating the aggregate version as a strong HTTP representation ETag. Application data responses use `Cache-Control: no-store`; TanStack Query handles in-memory caching.

List queries: inclusive `from`/`to`, `status=draft|finalized`, `season=<single ID>`, `q` across title/notes, `archived=true|false`, pagination. The optional archive filter uses the same team-local day and applies before pagination; omitting it retains both date groups. Today and upcoming Masses appear first, date ascending; past Masses follow, date descending (closest past first). Same-day ties use descending Mass ID. Ordering happens before pagination. List summaries include `is_archived`, derived from the same team-local day (`APP_TIME_ZONE`, default `Asia/Beirut`) used for ordering. This powers the list's Archived section without changing persisted draft/finalized status, revision, editing permissions or usage. A draft appears in planning/history lists when requested but never in usage calculations.

PATCH accepts editable metadata only and requires `X-Expected-Mass-Revision`. Delete requires Admin and that same header for either state; 204 removes the Mass and its selections while retaining hymns. Finalized PATCH returns 409 when the revision is current. Missing revision returns 428; stale returns 412 with the current revision and `X-Mass-Revision`. The client must refetch the actual record for conflict review. Parse the header as a positive integer; reject arrays, wildcard, or malformed values. Authenticate/authorize first, then check revision, then state, before writes.

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

M3 warning codes are `placement_mismatch`, `season_mismatch`, `duplicate_hymn`, and `inactive_selection`. A season notice requires a Mass season and at least one explicit hymn season with no matching link; `is_season_neutral=true` or an Ordinary Time (`ordinary-time`) link suppresses it, even when other season links are retained. An unspecified legacy classification is not an explicit different season. An Ordinary Time link also permits random selection and season preference in any season. Literal library filters remain literal; unspecified classifications remain excluded from random selection. Duplicate facts include `occurrences`. Retaining an inactive row requires its saved ID and unchanged hymn **and** placement; reordering or note edits are permitted. A position swap retains selection IDs; the PostgreSQL uniqueness constraint is deferred until transaction commit. Each effective metadata/program change advances the Mass revision once; identical representations are no-ops.

### Random picks — delivered M3 follow-up

`POST masses/{id}/random-picks/` requires Planner/Admin and a draft Mass. The body is `{season_id, placement_ids, excluded_hymn_ids}`: an existing season ID, 1–100 distinct active placement IDs, and up to 10,000 positive excluded hymn IDs (an empty exclusion list is valid). Unknown fields, invalid IDs, duplicate/inactive placements or missing season return 400; missing Mass returns 404; finalized Mass returns 409. The season may be a retained inactive choice. Excluded IDs are exclusions only and need not still exist.

This POST is a **read-only suggestion request**, with CSRF protection but no revision precondition or revision advance. The explicit body describes the browser's possibly unsaved season/choices. It returns `{picks: [{placement_id, hymn: <full Hymn>}], unfilled_placement_ids: [...]}`. Candidates come from the whole active library with the requested placement and the requested season, Ordinary Time, or season-neutral status. Randomized maximum matching avoids duplicates and maximizes placement coverage; assignments are not sampled uniformly over all possible programs. No-match returns 200 with empty picks. No history, usage or ranking is calculated.

The client inserts only into placements still empty in its latest working copy, rechecks duplicates/classifications, and discards responses after date/season/calendar-context changes or unmount. It then saves through the existing revision-guarded program PUT. Existing rows retain identities, notes and order. The endpoint does not reserve choices; later library changes follow the normal active-reference validation and advisory warning behavior. See [implementation notes](random-picker.md).

### Saved Mass history — M4

`GET masses/history/` uses the same `from`/`to`, `status`, `season`, `q` and pagination parameters as the planning list, but sorts newest date then Mass ID first. With no status filter the API includes both states; the React page defaults to `status=finalized` and offers Drafts only/All plans. Each summary includes `is_archived`, `selection_count`, and `preview` (first three ordered selections with ID, compact hymn ID/title, placement, position and notes). A link opens the full saved program. Drafts in this list never contribute to usage.

### Lifecycle — M4

`POST masses/{id}/finalize/` and `POST masses/{id}/reopen/` take `{}` and current `X-Expected-Mass-Revision`, return full Mass detail and `X-Mass-Revision`. Finalize and reopen require Planner/Admin. The finalized Edit pen confirms reopening before navigating to the draft editor; direct metadata/program writes on finalized Masses still fail. Admin-only DELETE accepts both states, removes only that Mass and its selections, and leaves library hymns intact. Current-state repeat calls return 200 without changing revision/timestamp. Stale calls return 412 even if the action was already performed. Finalization sets `finalized_at`; reopening clears it. No selections are copied or deleted. History reflects current status immediately.

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

M2 uses `["hymns", queryString]`, `["hymn", id]`, and an aggregate `["categories"]` key that fetches all five category lists with `is_active=all`. Hymn mutations invalidate library variants, affected details, and category reference data. The router updates URL state synchronously so controlled filter inputs respond immediately; queries provide loading states independently. M3 adds the Mass keys described below. Later milestones introduce `["hymn-usage", id, filters]`, `["recommendations", massId, placementId, filters]`, and `["dashboard"]`. Split category cache keys by kind/filter when M6 needs independent administration queries.

Program mutation refreshes Mass lists/detail. M5/M7 will additionally refresh affected recommendations and dashboard. M4 finalize/reopen refresh affected hymn details, usage lists, all usage-filtered library variants, and history. Category/hymn edits refresh dependent selectors/cards without losing unsaved form data. Request hooks must include filter/season changes in cache keys or invalidation.

Implemented endpoint shapes and errors are validated by the OpenAPI gate and integration tests; see [M2 evidence](m2-report.md). Future sections describe planned contracts, not available routes. Acceptance cases and exact fictional expectations are in [acceptance.md](acceptance.md).

M3 uses `["masses", queryString]` for list summaries and `["mass", id]` for saved detail. A mounted `DraftSaver` owns the working copy and its revision; background query refreshes preserve local Mass metadata, rows, order, and notes while reconciling live hymn/placement references. Advisory warnings derive from that local program and its refreshed references, including pending edits. A newly opened editor waits for its initial detail refresh before creating that working copy. Its 600 ms autosave debounce coalesces edits and serializes metadata PATCH then program PUT, using the acknowledgement's revision for the next request. Canonical metadata acknowledgements replace only fields unchanged since the request and become the next save baseline. Each endpoint is atomic independently; if metadata commits and program saving fails, retry preserves that metadata acknowledgement. Server-generated row IDs attach by local identity without overwriting subsequent edits. Unmounting stops queued requests, including the program PUT after a pending metadata PATCH; already-started requests may settle. Failures halt automatic writes until retry; revision/state conflicts require saved-version review and explicit discard/reload. Saved acknowledgements invalidate list summaries and saved detail. Internal navigation, browser unload, and sign-out warn about unconfirmed edits; offline durable storage and automatic merging remain deferred. See [M3 evidence](m3-report.md).

The October 8 picker/view follow-up adds `preferred_season` to the hymn list contract. The section picker sends `placements=<current ID>` by default and includes placement/season/override in its query key. Preference is calculated in PostgreSQL before pagination with a season subquery, avoiding duplicate rows from multi-season links. Unknown, malformed or repeated preference IDs return 400. Literal `seasons` filters retain their earlier behavior.

Frontend `/masses/:id` now displays saved read-only detail; `/masses/:id/edit` hosts the draft editor. Creation opens the editor, while list links open the view. **Save draft** awaits the shared saver drain (including an already-started autosave), then navigates only after React observes `Saved`. Calendar/random lookup must settle before finishing; editor controls stop accepting changes during the save. Failure/conflict keeps the editor and its working copy. The view waits for a fresh mount-time detail read and never changes Mass status or writes a program. Viewer/finalized edit routes redirect to the view. That M3 follow-up introduced no new save endpoint or flag. M4 adds the separate revision-guarded finalize/reopen endpoints above. See [review notes](m3-picker-view-review.md).

## Hosted storage — October 13, 2026

Hymn create/PATCH and authenticated PDF downloads can return HTTP 503 with code `storage_unavailable` and a generic retry message when private S3 storage fails. Provider credentials/details never appear in the response. Upload failure rolls back hymn metadata; no partial library record is committed. Existing PDF APIs, multipart envelope, roles and 10 MB limit are preserved. Missing files remain 404. See [hosting guide](hosting.md).

## Performance material fields — October 20

Hymn reads and POST/PATCH accept optional nullable `latin_title` (255 characters), `lyrics` (unbounded plain text) and `tempo` (50 characters, e.g. `Andante · 80 BPM`). Blank values normalize to null; lyrics preserve internal line breaks. `q` now searches `latin_title` as well as native title and the existing reference fields. Omitted PATCH fields are retained. Existing roles and private PDF delivery are unchanged. Migration: `hymns.0004_performance_materials`.
