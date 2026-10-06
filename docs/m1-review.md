# M1 review

**Added:** October 6, 2026. **Status:** Implemented and verified; coordinator review remains pending.  
**Owner:** Implementation owner. **Requested by:** Project owner.  
Review fixes delivered under M1, as requested. The checked items have a working form-to-database flow and automated acceptance evidence below.

**Usage priority:** The app will mostly be used on phones. Design and review the phone experience first, and carry this priority into later milestones.

## Fix list

- [x] **M1.R1 — Add PDF sheet music.** Enable uploading and attaching PDF sheet music to a hymn. Make the saved PDF accessible from the hymn detail page.
  - **Acceptance:** An Admin or Planner can attach a PDF, save the hymn, and open the attachment after refresh. Viewers can access saved sheet music but cannot upload or replace it. Invalid files or failed uploads show useful errors and preserve the other hymn form values.
- [x] **M1.R2 — Add polyphony and multiple voices.** Add a **Polyphony** checkbox to the hymn form. When enabled, allow adding, editing, and removing multiple named voices for that hymn, such as Soprano, Alto, Tenor, and Bass.
  - **Acceptance:** A hymn can be saved with polyphony enabled and multiple voices; the checkbox and voice entries survive refresh and subsequent edits and appear in the saved detail. Turning polyphony off when voices exist must prompt before discarding them. Existing hymns remain editable with polyphony disabled by default. Viewers cannot change the checkbox or voices.
- [x] **M1.R3 — Make duration a number field.** Change estimated duration to a numeric input in minutes, allowing decimal values while retaining the current optional, positive-duration rule.
  - **Acceptance:** Empty duration saves as unspecified; `3.5` minutes saves and round-trips correctly. Zero, negative, and invalid values show field errors. The number field works on desktop and mobile.
- [x] **M1.R4 — Compress search and tags.** Make the search area, tag selectors, and tag chips substantially more compact with tighter spacing and less padding. Keep search readily available; use a compact expandable tag picker and a concise summary of selected tags instead of displaying a large choice list by default.
  - **Acceptance:** Search and tags occupy visibly less space than the current screens on both phone and desktop. Users can still find, select, remove, and clear tags without ambiguity. Selecting many tags does not push the hymn results or the rest of the form far down the page; show a compact count/summary with access to the full selection. Text remains readable and touch controls remain easy to operate.
- [x] **M1.R5 — Prioritize phone use throughout the UI.** Adapt library search/filtering, hymn detail, and add/edit forms for frequent phone use. Use compact layouts, accessible touch controls, and expandable secondary sections to reduce unnecessary scrolling while keeping every field available.
  - **Acceptance:** Verify the main workflows at 360, 390, and 430 px phone widths: search/filter, open a hymn, add/edit metadata and tags, attach a PDF, and manage polyphony/voices once those fixes are implemented. No horizontal page scrolling, clipped controls, or overlapping content. The on-screen keyboard must not prevent reaching fields or Save/Cancel; primary actions remain easy to find. Arabic/Syriac text and long titles/tags remain readable. Recheck desktop usability after the layout changes.

## Delivery checks

Update models/migrations, API contracts, and code documentation as needed for each fix. Verify permissions, persistence, validation, and failed-save recovery using the real backend. Keep uploads and generated artifacts inside the project folder during development. Leave changes uncommitted unless the project owner explicitly requests a commit.

Track this list alongside the [development plan](../DEVELOPMENT_PLAN.md) and [backlog](backlog.md). It records the delivered review work; verification evidence is below.


## Completion evidence

- Additive migration `0002_sheet_music_and_polyphony` applied to the existing development database; existing records are preserved. The running development backend was refreshed on port 8000.
- Full code gate passed: **79 backend tests**, **13 frontend tests**, migration drift, validated OpenAPI, dependency consistency, lint/format, TypeScript, and production build.
- **24 browser flows verified** across desktop 1280×900 and phone widths 360/390/430 px: 20 authentication/permission flows passed in the initial run; all four enhanced Planner flows passed after correcting a test-only selector for the expandable metadata heading. Those flows cover real PDF upload/download, invalid-file and failed-save recovery, saved voices, cancellation of voice clearing, numeric duration, nine-tag summaries, filter/history persistence, and reduced viewport height for access to Save.
- Desktop/phone library, form, and detail screenshots inspected. Category pickers default to compact summaries; optional metadata is expandable; saved tags initially show three chips with access to the rest. Existing Arabic/Syriac data and all optional fields remain available.
- Backend PDF tests cover access roles, invalid/oversized files, replacement/removal/deletion, and cleanup after injected database failure. Voice tests cover round-trip order, uniqueness, and explicit clearing. Frontend tests check multipart CSRF/boundaries and preserved PDF/voice/duration input on failure.
- Test-created users, hymns, and PDF files were removed through scoped cleanup. Uploads, caches, logs, and screenshots stay inside the project; original specification unchanged; no commits or staging performed.

PDF attachments are downloaded through an authenticated endpoint and limited to one current PDF per hymn, up to 10 MB. Voice entries are names, not separate voice audio/PDF files. Framing checks do not provide a full PDF parser or malware scan. Filesystem crash/outer-transaction cleanup and backup handling are documented in [ADR-009](architecture.md). Physical-phone keyboard behavior and coordinator acceptance remain to be reviewed; browser tests use Chromium and a reduced-height viewport.
