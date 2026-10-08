# Architecture decisions — M0 through M3

**Decision date:** October 6, 2026. **Owner:** Implementation owner (Codex, this project).  
**Authority:** [Source specification](../mass_hymn_picker_codex_spec.md) and [development plan](../DEVELOPMENT_PLAN.md).  
**State:** Authentication/runtime foundations, hymn/category library, and draft Mass planning are implemented through M3. Lifecycle/usage, recommendations, and release decisions remain the baseline for M4–M7. See [M1 evidence](m1-report.md), [M2 evidence](m2-report.md), and [M3 evidence](m3-report.md) for current behavior and limits.

## ADR-001 — Runtime and repository boundaries

Use Django 5.2 LTS, DRF, PostgreSQL, and React/TypeScript/Vite. Exact initial selections are in [dependencies.md](dependencies.md) and [dependency-baseline.json](dependency-baseline.json). Django LTS is chosen for a small internal tool's maintenance horizon; unsupported or prerelease releases are excluded.

Use the following boundaries, extending the M1 structure as features arrive:

```text
backend/
  config/       # Settings, root URLs, WSGI; no feature business rules.
  accounts/     # Sessions, role resolution, authentication views.
  common/       # Shared errors, validation conventions, API primitives.
  hymns/        # Hymn and five classification models, selectors/services.
  masses/       # Mass/selection models, save/finalize services, ranking.
  tests/        # Cross-feature integration and transaction scenarios.
  requirements/ # Exact direct inputs and resolved reproducible requirements.
frontend/
  src/api/      # Typed HTTP client and API resources.
  src/components/
  src/features/{hymns,masses,settings,dashboard}/
  src/{layouts,pages,schemas,types,utils}/
  tests/
docs/
scripts/        # Documented project verification/setup helpers.
```

M1 implements config/accounts/common, authentication frontend/API, and tests/tooling. M2 adds the hymns app, library/form/detail routes, seeds, and library checks. Masses and other feature folders arrive with their milestones. Do not create a Django app per category. Models enforce storage invariants; serializers validate request shapes; services perform transactional changes; selectors implement shared read/usage queries; views handle HTTP and permissions. React never independently calculates authoritative usage or ranking.

M2 HTTP and Django admin mutations share documented services; admin forms validate the same write contract before calling them. Bulk deletion actions are disabled so category through-table cascades cannot bypass reference protection. Application roles and Django model/staff permissions both apply in Django admin. All five independent category types live in one app, with a fixed registry defining lock order. See `backend/hymns/services.py`, `selectors.py`, and the PostgreSQL concurrency test for the implemented contracts.

Use PostgreSQL in development and integration tests. SQLite cannot establish PostgreSQL locking, constraint, or aggregate correctness. Start with synchronous request handling, one database, no Redis/job queue, no Redux, and no external search service.

All changes and generated artifacts must remain under `C:\Users\t.lattouf\Projects\Choralation`. Do not modify user/system configuration, install globally, or write to the sibling visualization workspace. Future tooling must use project-local virtual environments and caches; Docker host provisioning is an external prerequisite, not authorized system installation.

## ADR-002 — Authentication, users, and permission policy

Use Django's built-in User and Groups. Do not create a custom user model: no required identity field justifies it. Foreign keys must use `settings.AUTH_USER_MODEL`, avoiding direct coupling to the concrete model.

Define application groups `Admin`, `Planner`, and `Viewer`. Highest recognized role wins; superusers have Admin privileges. An authenticated user without a recognized group is Viewer. `is_staff` grants access to protected Django admin only; it is not itself the application's Admin role. Provision users/groups with an idempotent command and protected Django admin. Never create public self-registration or seed passwords.

| Capability | Viewer | Planner | Admin |
| --- | --- | --- | --- |
| Read hymns/categories/Masses/history/recommendations | Yes | Yes | Yes |
| Create/edit hymn metadata and classifications | No | Yes | Yes |
| Change hymn active state | No | No | Yes |
| Create/edit draft metadata/program | No | Yes | Yes |
| Finalize a draft | No | Yes | Yes |
| Reopen a finalized Mass | No | No | Yes |
| Manage any category | No | No | Yes |
| Delete unreferenced hymn/category or draft Mass | No | No | Yes |
| Delete finalized Mass | No | No | No |

All team records are shared; author fields provide attribution rather than ownership-based visibility. Anonymous application access fails. Apply the same guards to services reached from Django admin so internal editing does not bypass finalized-state protection.

Use cookie sessions and same-origin requests. Vite proxies `/api` locally; production serves frontend and API at one origin. Django CSRF protection applies to login, logout, and every unsafe method, including JSON login for an anonymous user. The client explicitly bootstraps a CSRF token and refreshes it after login rotates it. No JWT or CORS dependency is needed for this topology.

## ADR-003 — Domain and database integrity

Use `BigAutoField` primary keys; do not rely on seeded numeric IDs. Preserve all source Hymn and Mass fields. ISO calendar dates represent the day of a Mass, while creation/update/finalization timestamps are timezone-aware and serialize in UTC. Configure the team's display timezone through `APP_TIME_ZONE`, initially `Asia/Beirut`. The owner's October 8 request supersedes the original manual-only season rule: suggest a Maronite season on creation/date changes, allow manual overrides, and never recalculate saved plans on opening. See [calendar sources and rules](calendar.md).

Classification tables have the source fields: name, stable unique slug, description, active state, nonnegative display order, and timestamps. Trim names; enforce a database uniqueness expression equivalent to lowercase trimmed name within each table. Unicode is retained; accent-insensitive or Arabic normalization search is deferred. Stable slugs are immutable after creation. For names without a usable slug, use a unique generated suffix; collisions are retried under the uniqueness constraint, not resolved only by a race-prone precheck.

Hymn title is nonblank but **not unique**. Duplicate titles and language variants are valid independent records. A hymn has one language, and independent M2M genre/season/placement/tag relationships. Require an active language and at least one active placement on creation. Nonneutral hymns require a season; no Admin unclassified exception in version 1. Genres/tags are optional. Normalize optional empty strings to null at the API boundary, trim basic metadata but preserve internal line breaks in notes, and validate URL schemes as HTTP/HTTPS. Duration is a positive decimal, not a float.

Use `PROTECT` for Hymn/Language, Mass/Season, Selection/Hymn and Selection/Placement references. Draft Mass deletion explicitly deletes its own selections in the same transaction; finalized deletion is forbidden. M2M category deletion must first check associations explicitly because Django's through-table cascade alone does not protect them. Reject hymn/category hard deletion when **any** reference exists, including drafts. Never delete usage to make another delete succeed.

`MassHymnSelection.position` is zero-based and unique within `(mass, placement)`. Require a contiguous 0..n-1 sequence in the save service and reject gaps/duplicates, rather than silently changing caller order. Do not make hymn IDs unique within a Mass/placement. Use a two-phase position update inside the locked transaction (temporary distinct positions above the existing/requested range, then final positions) so swaps cannot violate uniqueness mid-save. Add/remove/move rows within that same transaction and test it against PostgreSQL. No deferrable constraint dependency is needed.

Use indices on Mass date/status and selection lookup keys; prefetch category relations and select language/season in list selectors. Add further indices from measured query plans. In usage queries count selection IDs rather than multiplying rows from category joins.

## ADR-004 — Inactive relationships and historical labels

Deactivation removes choices from **new** links, not from existing programs or hymn metadata. The service compares incoming relationships to stored relationships: retaining an inactive ID is allowed, adding one is not. Saving unchanged classifications must remain possible after category deactivation; existing nonneutral season links remain valid even if now inactive.

An existing hymn with only inactive placements may retain them on an unrelated edit; changing its placement set must include an active placement. Existing language/season links can be retained. Forms display retained inactive chips and clearly separate them from new active choices.

Selections retain their stable IDs, hymn IDs, placement IDs, notes, and intra-placement order. Reordering an inactive selection inside its existing placement is allowed. Moving it to a new placement or replacing its hymn is a new relationship and requires active records. The planner renders active placements plus any inactive placements that already contain rows. This is essential to avoid hiding saved content.

Prevent active-check races with deactivation/deletion: link-creating services lock their owning Mass or Hymn, then affected Hymn rows in ascending ID order if needed, then classification rows in fixed type/ID order before checking active state. Category/hymn active-state and delete services lock those same records. Category services never acquire a Mass lock after locking a category, and hymn services never acquire a Mass lock after locking a hymn. Recheck current persisted relationships inside the transaction; frontend choices alone are not proof a record remains active. Cover concurrent deactivation and new selection/classification creation in PostgreSQL integration tests.

Live category/hymn labels can change in history; no immutable label snapshot is required. Section ordering follows current placement display order with an ID tie-breaker. Category changes never retroactively remove selections. Deactivation is not an automatic reason to refuse finalization of an already saved program; present an informational warning instead.

## ADR-005 — Save transactions and Mass lifecycle

Mass state is `draft` or `finalized`, starts at draft, and carries `revision=1`. The program API atomically replaces the complete selection list while retaining row identity supplied by the client. Metadata PATCH, program PUT, finalize, reopen, and draft DELETE share one Mass revision precondition.

Each mutation locks the Mass row with `select_for_update`, checks `X-Expected-Mass-Revision` against the current revision returned in `X-Mass-Revision`, verifies role/state, validates all requested relationships, and commits once. An effective change increments the revision once; an identical no-op leaves it unchanged. Selection IDs must belong to that Mass; unknown/foreign IDs are errors. New rows omit `id` and receive one only after commit.

Choose explicit revision headers rather than HTTP ETags: a Mass response contains live hymn/category labels and computed warnings that may change independently of Mass-owned data. A strong representation ETag would wrongly imply those fields were unchanged. The revision is solely a write precondition for the aggregate, not an HTTP cache validator.

| Transition/action | Allowed | Result |
| --- | --- | --- |
| Create Mass | Planner/Admin | Draft, revision 1, no finalized timestamp |
| Edit metadata/program | Planner/Admin on draft | Changed revision; draft remains draft |
| Finalize | Planner/Admin on draft | Finalized, timestamp set, changed revision |
| Repeat finalize with current revision | Planner/Admin on finalized | 200 no-op; no new usage/timestamp |
| Edit finalized | Nobody without reopening | 409 conflict; no write |
| Reopen | Admin on finalized | Draft, finalized timestamp cleared, changed revision |
| Repeat reopen with current revision | Admin on draft | 200 no-op |
| Delete draft | Admin | 204; own selections removed atomically |
| Delete finalized | Nobody | 409 conflict |

Stale revisions fail before idempotent state handling. A replay carrying the old pre-finalization revision therefore gets 412; refetching and retrying with the current revision safely returns the finalized record. No separate usage rows/counters are created.

Serialize autosave requests per Mass and coalesce later edits. Maintain a temporary working copy with save status, not a second global data store. Only apply an acknowledgement to the client version it acknowledges; never replace newer unsaved edits with an old server response. On failure keep edits in memory, offer retry, and warn on navigation. On 412 show local versus saved program for review; never auto-force an overwrite. Cross-tab merge/offline durable storage is out of scope.

**M3 implementation (October 7, 2026):** `masses` stores the protected aggregate and selection identities. Program saves lock Mass, then Hymns in ascending ID order, then placements in ascending ID order, matching library/category mutation ordering. Metadata changes lock the Mass before its season. A deferred PostgreSQL `(mass, placement, position)` uniqueness constraint permits atomic swaps without recreating retained rows. HTTP mutation adapters keep the service transaction open through response serialization, so acknowledgements describe the locked committed representation. Django admin is read-only for Masses/selections. The frontend uses a route-aware navigation blocker and a mounted serialized saver; pages load on demand to limit phone startup work. Metadata and program are separate atomic endpoints, sharing one revision. No lifecycle or recommendation routes are exposed yet.

Finalization waits for all pending saves, rechecks revision, and works even with optional empty placements. An entirely empty program may be finalized only after a clear UI review warning; do not introduce an undocumented database minimum-selection rule. Hard validation protects identity/active additions. Classification/repetition are soft warnings and never become forced suitability constraints.

## ADR-006 — Literal library filters and two usage contexts

Library filters AND across dimensions, OR across IDs within one dimension. Search is case-insensitive across title/alternate title/first line/composer/source and tag name. `seasons` is literal and does not implicitly include neutral-only hymns. Do not add an undocumented `include_neutral` behavior in version 1.

`usage_count` globally counts each selection occurrence belonging to a finalized Mass. `last_used_date` is the maximum Mass date. Two rows using the same hymn count twice. Drafts/reopened Masses contribute nothing. Future finalized plans remain included per the source, and the interface calls them scheduled; relative date labels never imply they have already been sung.

Ranking uses a second, explicit `history_context`: finalized occurrences with Mass date **strictly before** the target Mass date, excluding the target Mass. A hymn with only future/same-day usage can be never used **before this Mass** for ranking while having a nonzero global count. API/UI names and explanations must make that distinction clear.

Usage range predicates apply to occurrences (inclusive), not just the last date. Combined lower/upper bounds constrain the same occurrence. `not_used_since` means no finalized occurrence on/after that date and includes never-used records. Global library filters continue to include future finalized rows in their history predicates. Full serialization/query details are in [api.md](api.md).

## ADR-007 — Recommendation and warning rules

Backend eligibility requires an active hymn, requested active placement classification, and either the selected season or neutral flag. If no season is selected, match placement without season filtering and return a context notice. An inactive season retained on an existing Mass still supplies its relational matching context.

Use the exact additive scoring/tie-break rules in the development plan. Season match and neutral bonuses may both apply. Recency and never-used bonuses are mutually exclusive. Apply -100 once when the hymn already appears anywhere in the target Mass. Final tie-breaking by ID prevents unstable duplicate-title order. Use a shared facts object for reasons and score; test boundaries with an explicit reference date.

Warnings include duplicate hymn in the current program, usage on the Sunday strictly preceding the target date, eligible recent usage within 30 days, and placement/season mismatch. A Sunday target's preceding Sunday is seven days earlier; for a midweek target use the most recent earlier Sunday. Warn about inactive retained rows separately. Return facts and codes; UI text uses current category labels rather than hard-coded names. Acknowledgement belongs in the picker/review workflow; no stored pastoral override flag is required in version 1.

For an empty recommendation result show an All Hymns action, not widened eligibility. The manual picker may choose any active hymn/active placement after acknowledging suitability warnings.

## ADR-008 — Seeds, documentation, and deployment

Seed only initial categories and role definitions; production seeds contain no hymn library/password/demo Mass. Use immutable slugs as initial identifiers and create missing defaults without updating existing rows. Renames never change slugs. Hard-deleted seed entries can be recreated by an explicitly rerun seed; document this behavior and recommend deactivation instead when administrators want a default to stay unavailable. This resolves the otherwise ambiguous seed/delete interaction.

Test/demo datasets are explicitly fictional and isolated. They are not Django fixtures to load into production and do not contain real hymn lyrics. Read [acceptance.md](acceptance.md) for the symbolic-key fixture contract.

Read [code-documentation.md](code-documentation.md) before implementation. Every service/query contract, concurrency rule, and unusual integrity choice needs accurate nearby documentation and meaningful tests. Do not comment trivial syntax or leave current-milestone TODOs.

Production uses Linux Gunicorn behind a same-origin TLS/static-serving proxy, environment secrets, secure cookies, `DEBUG=False`, and PostgreSQL backups. Windows development instructions use PowerShell-friendly commands. Host/provider, domain, credentials, and production rollout remain M7 decisions; this architecture does not authorize deployment. No infrastructure was created during M0.

## ADR-009 — M1 review: private sheet music, voices, and phone use

The project owner requested these additions after M2 under [M1 review](m1-review.md). Preserve the original specification and implement the approved extensions with additive migrations: existing hymns start with polyphony disabled, an empty voice list, and no PDF attachment.

Store a single optional PDF per hymn under project-local `.local/media` by default, using an opaque UUID key and a separately stored original display filename. `DJANGO_MEDIA_ROOT` allows runtime-specific private storage. The optional Docker image uses `/app/media`, provisioned for UID 10001, and Compose mounts a persistent `backend-media` named volume there. Docker execution remains an external prerequisite and was not performed under the project-only write constraint. Preserve the existing sheet-music URL. Do not expose a public media route; serve downloads through the authenticated hymn endpoint with attachment disposition and `nosniff`. Validate extension, nonempty size up to 10 MB, and header/EOF framing before writing. This framing validation is not a full PDF parser or malware scanner.

Metadata, classifications, and the PDF reference save through the same locked aggregate. Validation runs before file writes. Remove a newly stored file if the service transaction fails; delete replaced/removed files only after database commit. Filesystem writes are not database transactions: abrupt termination or rollback of a surrounding caller transaction may leave an unreferenced file. Preserve referenced files and include upload storage in the M7 backup/cleanup design; database-only backups do not contain PDFs. Django admin uses the same validators/services; browser fixture cleanup uses the delete service too.

Voices are ordered, unique, trimmed names owned entirely by a hymn, stored as a JSON list. They currently have no independent identity, classification, or per-voice audio/PDF attachment. The API validates names and the database prevents a nonpolyphonic hymn retaining voices. Turning polyphony off in the UI asks before clearing them; the API requires explicit clearing when names exist.

Phones are the primary usage surface. Keep search visible, category/tag pickers collapsed until needed, and selected tags summarized. Render at most three saved category chips initially with access to the rest. Collapse optional form metadata, show only provided metadata in detail, and keep touch targets large while reducing padding and whitespace. Numeric duration remains a positive decimal value in minutes. Test phone widths 360/390/430 px, reduced viewport height for keyboard access, and desktop together; physical-device keyboard behavior still needs coordinator review.
