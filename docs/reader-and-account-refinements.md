# Account and PDF reader refinements — October 25, 2026

## Behavior

- Registration checks normalized username availability after a short typing pause. The check is advisory; the transactional registration service and unique profile key still decide availability at submission. Case variants cannot register a second account. Checks are CSRF-protected POSTs with persistent per-client and deployment limits, keeping prospective names out of URLs.
- New passwords need at least eight characters, an uppercase A–Z letter, a number 0–9 and a symbol. Spaces do not count as symbols; underscore does. Existing common-password and similarity checks remain. Registration, password changes, future email recovery and Django administration use the backend policy. Existing passwords still work for sign-in. The local meter is composition/length feedback, not a guarantee of password entropy.
- Password masking uses normal-weight text, retaining one-second typed-character preview and Show/Hide.
- PDFs default to whole-page/length fit. Zoom, fit, download, page count and fullscreen controls are compact overlays inside the reader. Fullscreen uses the browser Fullscreen API when permitted and otherwise fills the available viewport. Browser/OS chrome cannot be hidden by a webpage when native fullscreen is unsupported or denied. Fullscreen controls fade after inactivity and return on tap, mouse movement or keyboard focus.
- Fullscreen side arrows, side taps and horizontal swipes turn PDF pages. Vertical gestures scroll long pages. At manual zoom above 100%, horizontal gestures pan instead of turning pages; multiple fingers cancel page-turn recognition. Outside PDF fullscreen, Mass focus-mode swipes retain hymn navigation.
- Fit selection is shared across PDFs within one Mass focus session, including returning to earlier hymns and opening/closing PDF fullscreen. A new focus session starts with whole-page fit.
- Hymn editing displays an attachment preview. Select **Replace sheet music PDF**, preview the local selection and save. Cancel PDF replacement restores the current attachment. Changes are not uploaded until Save hymn; local object URLs are revoked on replacement/cancel/unmount. Backend permissions, 10 MB validation and commit-safe replacement remain enforced.
- Phone Mass creation places compact date and season controls on one row.

## Mass sections and preservation

The standard order is Opening, Responsorial, Glory, Offertory, Incense, Pax, Sanctus, Agnus Dei, Communion, Thanksgiving, Closing.

Migration `hymns.0005_mass_sections` renames equivalent existing Opening Hymn, Psalm and Closing / Recessional rows while preserving IDs and relationships. Entrance / Processional, Gospel Acclamation, Sermon / Reflection, Anthem and Meditation become inactive; selections and hymn classifications are retained. Existing programs continue to show retired sections that have selections. No uncertain mapping from old musical sections to new ones is invented. Custom sections remain. If a new-named custom section already exists, the old equivalent is retained inactive rather than merging records. The migration is repeatable and its reverse does not destructively infer older labels. Back up before hosted migration; application rollback does not undo this data change.

New installations get the revised defaults from `seed_initial_data`; repeating seeding preserves owner edits.

## Missing hosted attachment

The reported hosted Arabic hymn retains its PDF name and storage reference. The authenticated download endpoint already returned 404 before the previous release. No exact original file was found in the project or the checked local document folders; the database backup contains references, not Storage object bytes.

An owner must check Supabase Storage → private `sheet-music` bucket for the referenced object (object keys include the `sheet-music/` prefix). If absent, recover it from a file backup or replace it through Edit hymn using the original PDF. If present, check the deployed bucket/endpoint configuration and access credentials; do not make the bucket public. A browser preview change cannot recover missing object bytes. The old reference has not been cleared or overwritten during diagnosis.

## Acceptance

Automated tests use isolated databases, fictional accounts/PDFs and captured email, with no live account email sends. Physical iOS/Android acceptance remains an owner check: fullscreen permission, OS browser chrome, swipe direction, pinch/pan, rotation and PDF rendering. No hosted deployment or payment-plan change is included in this refinement.

Reader conventions were checked against [Mozilla PDF.js’s viewer](https://github.com/mozilla/pdf.js/blob/master/web/viewer.html) and [Adobe’s fullscreen guidance](https://helpx.adobe.com/acrobat/using/viewing-pdfs-viewing-preferences.html).

Validation: the full backend suite passed 372 tests; the added final registration-policy regression then passed with all 13 refinement tests. All 100 frontend tests, type checking, lint/format, schema validation, migration consistency, production build and production-serving smoke passed. The final PDF/password/mobile-date browser suite passed 16 cases across desktop and 390/360/430-pixel profiles. The final simple-registration/Mass browser suite passed 36 additional cases across the same four profiles (52 affected browser cases in total).

The local database was backed up and migrated successfully; active defaults exactly match the requested eleven sections. Account, hymn/attachment, Mass and selection fingerprints remained unchanged. The hosted-backup migration rehearsal also preserved all non-classification records. The original eleven placement records were retained, with five new sections added and obsolete defaults inactive. Nothing has been staged, committed, pushed or deployed for this refinement.


## Choir join-request visibility

The main **Choirs** page now includes a **Join requests** inbox above the choir cards. Admins see pending applications across all choirs, including private choirs where they are not members. Choir planners see only applications for choirs they manage; members retain their own **Your applications** list without access to other applicants. Each row names the applicant by username and the choir, with Approve/Decline actions. Emails and private join codes are not included in the inbox response.

A **Manage choir** link on each managed choir card opens its detail page, where the existing requests/settings remain available. **Use choir** changes active choir context separately. The inbox supports pagination, explicit refresh, periodic refresh and updates after decisions; authorization is enforced again by existing decision services. No new database migration is needed. Backend choir/privacy/concurrency checks (29 tests), all frontend tests (105), schema validation, migration consistency and production build pass.

The real Admin inbox flow passed on desktop and 390/360/430-pixel phone profiles: an Admin outside the private choirs approved one request, declined another, checked the resulting memberships and opened Manage choir. Local backend reloaded; hosted deployment remains pending.
