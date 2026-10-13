# Random hymn picker — October 8, 2026

**October 8 checkpoint update:** M3 engineering and all requested follow-ups are complete and committed as `daefc9b`. The owner authorized the M3 commit and starting M4. Statements about uncommitted changes below describe their original verification runs. Human walkthrough/physical-phone acceptance remains pending and is now a required M4 gate; see [acceptance criteria](acceptance.md). The [latest review](m3-picker-view-review.md) records saved view, empty sections and Mass ordering.

## Behavior

In a draft Mass, select a liturgical season and press **Random hymns** above the program. Each empty active placement receives at most one active hymn classified for that placement and either the selected season or season-neutral use. Existing selections, order, identities and notes stay intact. The picker excludes every hymn already in the local program and avoids duplicates among its additions.

Unmatched placements remain empty and are named in the result. Use **+** to choose manually, including an explicitly acknowledged classification mismatch. The random button is disabled without a season, during calendar lookup, while picking, after all placements are filled, or while a save error needs attention. Viewers and finalized plans have no random control. Removing a choice makes its placement available for another pick; a later pick can select that same hymn again by chance.

## Implementation

- `backend/masses/random_picker.py` queries all eligible candidates instead of sampling a library page. It shuffles placement/candidate order with `SystemRandom`, then uses augmenting paths to maximize the number of distinct matched placements. This avoids an avoidable empty placement when a flexible hymn has an alternative. Coverage takes priority; assignments are not uniformly sampled over all possible programs.
- `POST /api/v1/masses/{id}/random-picks/` is Planner/Admin-only, validates bounded explicit draft context, and returns suggestions without saving or advancing a revision. It needs no external service, new dependency, database migration or fabricated usage history. [API contract](api.md) documents its fields and errors.
- `RandomPicker.tsx` applies returned picks to the **latest** working copy, rechecking occupied placements, active/matching classifications and hymn duplicates. Manual edits made while waiting are preserved. Date/season/calendar/active-placement context keys and unmount cancellation discard obsolete responses; synchronous metadata checks also protect changes before the next render.
- Insertions use `DraftSaver.update`, so metadata/program writes remain serialized with the existing shared revision. Failed saving preserves random additions locally and offers **Retry save**; conflicts require the existing saved-version review. Request failures leave selections unchanged. Library state can change after suggestions are read: program PUT revalidates active references and retains its existing classification-warning behavior.

## Verification

The new backend tests cover season/neutral eligibility, activity, placement, exclusions, whole-library selection beyond 100 candidates, maximum coverage, no duplicates, no suggestion-side writes, explicit unsaved season, empty pools, invalid context, permissions and finalized state.

The new frontend tests cover preservation of rows/notes/metadata, latest-copy insertion, duplicate/classification checks, pending controls, empty/error states, and cancellation after metadata changes/unmount. Browser checks exercise the real endpoint and normal save queue, deliberate program-save failure/retry, reload persistence, preserved selection identity/notes, matching classifications and no horizontal overflow at desktop and phone widths.

The full `dev.cmd check` gate passed with **136 backend tests and 35 frontend tests**, dependency/Django/migration/schema checks, lint/format/type checks and production build. All **four focused browser flows** passed at 1280, 360, 390 and 430 px. The phone screenshot was inspected, and scoped cleanup removed the temporary test accounts and their owned records. The final message-only refinement was also verified with all six picker frontend tests. Documentation links and the original specification hash passed the static verification gate. The local app backend was restarted and readiness returned HTTP 200 with `{"status":"ok"}`. No changes were staged or committed.

Run `dev.cmd check`, then in a project PowerShell session use `.\scripts\e2e.ps1 -TestArguments @('masses.spec.ts', '--grep', 'Random picker')` for the focused browser checks. Physical-phone/Safari/Firefox review remains outside these browser checks. The existing shared-entry bundle warning remains tracked for M7.
