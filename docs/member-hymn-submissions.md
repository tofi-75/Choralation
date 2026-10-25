# Member hymn submissions

Regular members can add hymns without editing the shared repository. “Private” means stored in the member’s account across devices, not only in browser storage. Platform Admins retain oversight. No anonymous public access is added.

## Member flow

1. Choose **Add hymn** from Home or Hymn library. Add metadata, lyrics and an optional PDF (up to 10 MB).
2. Save. The hymn is private, visible through **Hymn library → My hymns**. Its metadata, lyrics and authenticated PDF endpoint are unavailable to other ordinary users.
3. Choose a choir you belong to and click **Request planner approval** on the hymn’s detail page. The selected choir’s planners can then read the submission and its PDF.
4. Approval publishes the hymn to the shared library for all signed-in users and makes it selectable in every choir’s Masses. One planner approval suffices. Requesting changes keeps the hymn private and shows the author the feedback.
5. Editing a pending hymn withdraws that version. Save and request approval again after changes. Members can delete their own unpublished copies; shared-hymn deletion remains Admin-only and shared editing remains a Planner/Admin capability.

Members without choirs can keep private hymns and join a choir later to request approval. Existing Planners/Admins retain their existing direct shared-library creation capability. Ordinary members cannot promote themselves, forge publication state or edit a published hymn by guessing its ID.

## Planner flow

Open **Choirs → Hymn submissions**, or **Manage choir → Hymn submissions**. Choose **Review hymn** to inspect its PDF, lyrics and metadata, then **Approve and publish** or **Request changes** with optional feedback. Reviews are scoped to the submitted choir’s current planners; an app-wide Planner role alone is insufficient. Admins can review across choirs. The selected usage choir does not authorize reviewing another choir’s submission.

Review feedback and the private submission choir are not returned with the published hymn. Declining ends the planner’s continuing access to that unpublished version and returns them to Choirs. Approval checks the version the reviewer opened; stale approvals must refresh. Concurrent edits and approvals cannot publish unreviewed content.

## Storage, queries and migration

Additive migration `hymns.0006_member_submissions` marks existing hymns published without changing IDs, PDFs, passwords, Masses or selections. New state and choir/reviewer references track moderation. The default hymn manager returns published rows only, covering library lists, suggestions, random selection, Mass write lookups and shared counts. An explicit restricted queryset handles private author/reviewer access; authenticated file downloads use the same restriction. Classification reference protection includes unpublished material.

Authenticated collection routes are `GET /api/v1/hymns/mine/` and `/api/v1/hymns/review-queue/`. The latter optionally accepts `choir_id`; both paginate. Owner submission uses `POST /api/v1/hymns/{id}/submit/` with `choir_id` and `expected_updated_at`. Review uses `POST /api/v1/hymns/{id}/review/` with `decision` (`approve`/`decline`), `expected_updated_at` and optional `note`. Write payloads cannot set moderation fields. Member writes and submissions have persistent abuse limits. Private responses retain the existing no-store policy; session/choir changes clear relevant caches. Unsaved hymn changes are guarded on choir changes/sign-out as well as browser unload.

## Release and rollback

Back up before applying the additive migration. Preserve the original PDFs and storage settings. Do not roll the application back to a version predating moderation after private hymns have been created: older code does not enforce publication visibility. Use a moderation-aware rollback or forward fix. Reversing the database migration is blocked while unpublished hymns exist, to avoid losing their privacy state. A database backup includes file references, not PDF object bytes.

For owner-assisted account deletion, remove unpublished copies and their PDFs before deleting their owner; preserve approved shared content without unnecessary personal attribution, subject to the privacy-request procedure. Gmail, verification flags, hosting plans and provider configuration are unchanged. Deployment remains owner-controlled.


## Local validation — October 26, 2026

The full backend suite passed 381 tests, including private PDF access, wrong-choir review denial, owner-only editing, stale versions, classification protection, Mass exclusion, abuse limits and a real concurrent edit/approval race. Additional auth/capability and production-routing checks passed after the final changes. All 110 frontend tests passed, along with type checking, lint/format, schema/migration consistency and the production build. Sixteen combined moderation/library browser cases passed across desktop and 390/360/430-pixel phone profiles, including feedback, resubmission, publication and ordinary-member restrictions on shared edits. Production serving smoke includes direct refresh of `/hymns/mine`.

The hosted backup was restored into a disposable local database and upgraded successfully; existing records and file references were preserved. The actual local database was backed up, its original account/hymn/Mass/selection fields fingerprinted, and the additive migration applied with those fingerprints unchanged. All pre-existing local hymns remain published. Local services have the new code; no hosted migration, commit, push, deployment or payment change was performed.
