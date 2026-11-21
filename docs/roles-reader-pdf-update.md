# Choir roles, Mass reading and lossless PDFs

Implemented locally November 21, 2026. This batch is separate from the live `91a8c56` release. Commit, push, deployment and hosted conversion require separate authorization.

## Global accounts and choir assignments

The global API and account badge use **Admin**, **Choirmaster** and **User**. New accounts are Users. Admin approval of a Choirmaster request grants choir creation only. The existing `can_create_choirs` profile flag remains the source of that approval. Existing request history and `/auth/manager-requests/` URLs remain compatible; the interface calls them **Choirmaster requests**.

Every choir has independent **Choir Leader**, **Planner** and **Member** assignments (API values `Leader`, `Planner`, `Member`). Creating a choir assigns its creator Leader. A Choirmaster can be a Member of another choir; a User can be appointed Leader without becoming a global Choirmaster. Revoking Choirmaster approval preserves all choir assignments.

| Action | Choir Member | Choir Planner | Choir Leader | App Admin |
| --- | --- | --- | --- | --- |
| Read the choir's programs and history | Yes | Yes | Yes | All choirs |
| Create/edit/finalize/reopen its Masses | No | Yes | Yes | All choirs |
| Delete its draft or finalized Mass | No | No | Yes, with confirmation | All choirs, with confirmation |
| Change choir settings/calendar/codes; approve join requests | No | No | Yes | All choirs |
| Assign Member, Planner or Leader | No | No | Yes | All choirs |
| Edit shared hymns | No, unless assigned Planner/Leader elsewhere | Yes | Yes | Yes |
| Review private hymn submissions | No | Receiving choir only | Receiving choir only | All choirs |
| Delete shared hymns; manage global classifications | No | No | No | Yes |

Only global Choirmasters and Admins create choirs. This permission does not follow from a Leader/Planner assignment. Members retain private hymn creation and management. The last Leader cannot leave or be demoted/removed without a replacement. Admins can assign a Leader to an existing leaderless choir.

Migration `choirs.0003_choir_leaders` runs after the original choir migration. It promotes existing Planner memberships belonging to accounts with choir creation permission to Leader. Other Planners stay Planners. Choirmaster permission, request decisions, passwords, Masses and attachments are preserved. Legacy Django Planner/Viewer groups no longer determine global account roles.

## Reading and creation

- Phone PDFs default to **fit to width** in portrait and landscape in hymn detail, Focus and PDF fullscreen. Rotation restores width fit at normal zoom. Explicit PDF zoom and browser pinch zoom preserve the zoomed scale. Fit controls remain available; desktop defaults to whole-page fit.
- Activating any part of a saved Mass hymn row opens the complete Focus program at that **selection ID**. Repeated hymns remain distinct. Closing Focus restores the initiating row's keyboard focus and scroll position. The main Focus button and reload restoration still start at the first hymn.
- Holding a row for 500 ms opens a small **Go to hymn** popup. Its link opens hymn detail with **Back to Mass**. Mouse hold, right click and Shift+F10 are supported. Movement over 10 CSS pixels, scrolling, cancellation and multitouch cancel the hold. Releasing a completed hold does not also open Focus. Outside activation or Escape dismisses the popup.
- Creating a hymn from a draft preselects the originating active Mass placement. The placement remains editable. A failed save preserves the user's choices. Returning to the draft retains the existing warning-confirmation and single-insertion behavior.

## Lossless PDF storage

Uploads remain ordinary PDFs up to **10 MB before compression**. With `PDF_COMPRESSED_WRITES=true`, the server stores exact original bytes in a gzip object, never rerasterizing or changing PDF content. Encoding, original byte length and SHA-256 are stored beside the private reference. Legacy records default to `identity`.

The authenticated sheet-music URL and original `.pdf` download name remain unchanged. Clients accepting gzip receive the stored representation with `Content-Encoding: gzip`; the browser decompresses it for PDF.js and downloads. Other clients receive the original bytes. Responses vary on Accept-Encoding, remain no-store, and retain publication/access checks. Inflation and stored reads are bounded, and length/hash checks detect corrupt representations. Failures return sanitized storage errors. No new range-request support is advertised. This reduces storage/network bytes where compressible; it is not a one-second performance guarantee.

Replacement, removal and deletion work for both encodings. Old objects are removed only after commit and only when no hymn, including private hymns, still references them. The storage startup canary checks gzip write/readback and cleanup. The isolated container harness exercises compressed uploads, both download representations, restart persistence, replacement and deletion.

## Staged rollout and conversion

1. Before any separately authorized hosted release, back up **both PostgreSQL and all private Storage objects**. A database dump contains file references and encoding metadata, not PDF bytes. Copy every object, including `.pdf.gz` files; do not filter the backup to `.pdf`. Retain an immutable pre-conversion snapshot together with its matching database backup.
2. Deploy the additive migrations and dual-format reader with `PDF_COMPRESSED_WRITES=false` (the default). Verify legacy PDFs and account access. Keep old application processes from writing during the role migration.
3. Enable `PDF_COMPRESSED_WRITES=true` in a separately authorized rollout; verify new uploads, PDF.js and downloads. Once compressed objects exist, application rollback must retain a dual-format reader, or restore the matching database/object snapshots.
4. Preview conversion with `.venv\Scripts\python.exe backend/manage.py compress_pdfs --limit 100`. Dry run is the default. Use `--after-id ID` to continue through batches.
5. Apply with `.venv\Scripts\python.exe backend/manage.py compress_pdfs --apply --limit 100`. This requires the compressed-write flag. Each file is packed to a new unique object, read back and verified, then switched under a short row lock only if its original reference is unchanged. Concurrent replacement/deletion wins; conversion cleans only its own unused object. Old objects are cleaned after commit when unreferenced. Conversion preserves hymn titles, original filenames, publication/review state and authorship timestamps.
6. Missing, inaccessible or invalid files are reported by hymn ID and skipped. Fix them separately and rerun from an earlier ID. Already compressed rows are skipped, making retries resumable. Verify attachment audit and restore samples after conversion.

Physical iPhone Safari and Android Chrome acceptance remains pending. Automated phone-width Chromium results are supporting evidence, not a physical-device claim. No hosted conversion has been run for this batch.

## Local verification

Both additive migrations were applied to the development database after a verified `pg_dump` archive and separate media copy under ignored `.local/backups/roles-pdf-20261121T062659Z-2160c1/`. Existing account/profile/request, choir, hymn, Mass and selection data fingerprints matched before/after; membership roles matched the selective backfill. Existing local attachments were not converted outside isolated test data.

Checks cover backend permissions/concurrency and migration preservation, gzip negotiation/exact bytes/corruption/rollback/conversion races, frontend gestures and placement prefill, desktop and phone-width browser journeys, OpenAPI, migration consistency, formatting/lint/type checks, production frontend build and documentation links. The production S3/container persistence harness was updated for compressed objects; running that Linux CI job remains release verification work.

Final results: **452 backend tests**, **127 frontend unit tests**, and **21 affected browser cases** passed across desktop and 390px phone runs. Email-verification/recovery browser cases were intentionally skipped in simple-account mode; the phone-only rotation case was skipped on desktop. Production frontend build, types, lint/format, OpenAPI, migration consistency, Git whitespace and 283 documentation links passed. No physical device or hosted deployment is claimed by these results.

Review follow-up: the hosted administration helper now accepts the new role names and defaults to User. Hymn holds observe pointer release/movement outside the row and retain cancellation when another finger lands on the row. Six CLI forwarding/rejection tests and six additional gesture cases were added; the affected suites passed **31 backend tests** and **24 frontend tests**, with types/lint checks. The full-suite totals above describe the earlier checkpoint. [System test optimization](system-test-optimization-plan.md) is planned separately; runner and CI settings remain unchanged.
