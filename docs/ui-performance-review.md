# Performance reading and UI review — October 20, 2026

## Delivered locally

- Home: the New hymns heading and action group align vertically. Mass-list navigation stays on one row; compact labels/padding fit narrow screens, with horizontal overflow as a last-resort fallback for extreme zoom.
- Saved Mass: centered placement labels and prominent hymn-title links. Focus mode opens the first selected hymn in configured placement/program order, skipping empty sections and retaining repeat selections and performance notes. The session snapshots that saved sequence; background edits apply when focus mode is opened again.
- Focus mode: private uploaded PDF first; otherwise lyrics; otherwise title. Swipe left/right, use previous/next controls or keyboard arrows. Stops at either end. PDF pages have their own controls. Escape/Exit closes the dialog, restores focus, and releases the screen wake lock. Returning to the visible tab reacquires a lost lock. Unavailable/declined screen-awake requests have honest status and retry; they do not block reading.
- Hymn detail: title/language plus key, tempo and voice count, then PDF and lyrics, followed by concise classification and metadata. Usage and scheduled/last-used date now live at the top of metadata. Edit uses the pen icon with an accessible name.
- Hymn form: burgundy asterisks mark Title, Language, Suitable placements and Suitable seasons. Lyrics, Default key and Tempo are beside sheet music. Latin Characters Name appears for Arabic/Syriac, a title containing non-Latin letters, or an existing Latin name; it is an optional manually supplied transliteration, searchable through the existing `q` filter alongside native titles. Other reference fields stay collapsed.

## Data and deployment

Migration `hymns/0004_performance_materials.py` adds nullable `latin_title` (255), `lyrics` (text) and `tempo` (50). Tempo is descriptive text, e.g. `Andante · 80 BPM`; no guessed tempo is derived from duration. No existing content is rewritten. Existing API permissions, private PDF endpoints, 10 MB upload limit and Mass revisions are preserved. The migration has been applied only to the local development database; production applies it through the existing deployment startup process.

PDF.js is pinned at 6.4.299. It is loaded on demand. Worker, fonts, CMaps and decoders ship on the application origin under `/assets/`; no PDF content goes to a third-party viewer. Generated font/decoder files are ignored by Git and copied during predev/prebuild/pretest:e2e. One PDF page canvas is rendered at a time, with bounded resolution, cancellation and document cleanup. PDF failures show a retry/download option and fall back to available lyrics/title. External sheet-music URLs remain explicit links.

Screen awake uses the browser's [Screen Wake Lock API](https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API). HTTPS (or a browser-trusted local origin), browser support and system permission are required; the OS can revoke a lock. Physical-device testing on the hosted HTTPS URL remains M5 acceptance. Focus mode does not write selections, change finalization or increment usage.

## Next UI work, in order

| Priority | Improvement | Completion evidence |
| --- | --- | --- |
| 1 | Performance rehearsal on physical iOS Safari and Android Chrome; long and multi-page PDFs, screen lock/re-entry, orientation, slow/interrupted downloads | Record actual devices and results; no lost navigation or unreadable material. Preserve the M5 gate. |
| 2 | Establish shared color, spacing, typography and control tokens; consolidate duplicated CSS into focused component styles | Visual snapshots at 320/390/539/844/1280 px, keyboard and zoom checks; consistent loading/empty/error states. |
| 3 | Reader refinements: lyric text-size control, fit-width/zoom for scores, hymn jump menu and remembered position within an active session | Rehearsal feedback, keyboard/touch parity and bounded PDF memory; no usage writes. |
| 4 | Accessibility audit: contrast, visible focus, reading order, live messages, 200% zoom and screen readers | Resolve audit findings and record VoiceOver/NVDA journeys for core tasks. |
| 5 | Language settings and full Arabic UI (deferred feature) | English/Arabic selector; persisted account preference with safe pre-login fallback; translated navigation, forms, dialogs, validation/errors, dates/counts and accessible labels; complete RTL layout. Preserve original hymn content and transliteration search. Test mixed Arabic/Syriac/Latin content, PDF, swipe direction and keyboard focus in both languages. |
| 6 | Measure larger libraries and long programs before tuning caching, request volume or rendering | Representative measurements and explicit budgets; compare before/after. Offline storage requires a separately reviewed access/sign-out policy. |

Recommendations and Practice remain future work. The Arabic feature is planned, not partially exposed in the UI.

## Verification

- Backend: **237 tests passed**, using a separate local test database; new checks cover Unicode/Latin-name search, lyrics preservation, blank normalization and field limits.
- Frontend: **72 tests passed**. The four performance tests were also rerun after the session-snapshot refinement, covering material priority/failure, touch/keyboard bounds, background selection removal, wake-lock refusal/reacquisition/release/late grant and focus restoration.
- Browser: **16/16 focused scenarios passed (3.1 minutes)** across desktop and 360/390/430 px phone profiles. They cover the new form/search, authenticated PDF canvas, PDF failure fallback, swipe/keyboard PDF→lyrics→title navigation, wake-lock ownership, alignment at 320/478/539/844 px, and stale finalization preserving unsaved work. Earlier library/Viewer/Admin/weekly-workflow scenarios plus the stable focused rerun cover **28 distinct scenarios** across these three spec files; there was not one completely green initial 28-test run.
- Initial browser failures included development Strict Mode's two wake-lock requests (the assertion now checks every acquired lock was released), a layout measurement racing async home data (rectangles now read together after loading), and one stale-editor test during active edits. All affected scenarios passed in the stable focused rerun. A duplicated React sibling key was corrected during review.
- Migration consistency, Django system check, OpenAPI validation, backend lint/format, frontend type/lint/format checks and production build passed. The existing main-bundle size advisory remains; the PDF renderer/worker are separate lazy assets.
- Production static smoke: actual built PDF worker, CMap, font and WASM decoder return 200 with non-HTML content types through Django; missing decoder returns 404.
- Reviewed desktop/mobile screenshots in the project-local Playwright results. Logs: ignored `.cache/performance-browser.log` and `.cache/performance-browser-final.log`. Browser fixtures/accounts were cleaned up; local services remain available. Nothing staged or deployed.

Physical-phone, OS screen-awake behavior, and hosted deployment acceptance remain pending; browser emulation and a mocked wake-lock counter do not close those gates.

## PDF fullscreen follow-up

Click/tap the PDF preview (or its Fullscreen control) in hymn detail or Mass focus mode to expand it. A modal reader requests native browser fullscreen in the original click gesture and fills the viewport if the browser declines or lacks that API. The same loaded document and page are retained; only one page canvas is mounted. Exit returns to the same hymn/page and restores keyboard focus. PDF page arrows/gestures remain isolated from the underlying Mass navigation while expanded; exiting the PDF leaves Mass focus mode active. Downloads remain explicit.

The implementation follows [Fullscreen API activation and lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen) and [React's synchronous browser-integration pattern](https://react.dev/reference/react-dom/flushSync). The two-page fixture is fictional and contains no real sheet music. Schema and backend permissions are unchanged.

Fullscreen follow-up verification: **4/4 real-browser scenarios passed** on desktop and 360/390/430 px profiles (1.4 minutes), covering native fullscreen from both locations, the denied-API viewport fallback, two-page preservation, nested Escape, return focus and continued hymn navigation. Type checking, lint, formatting and production build passed. Final ignored log: `.cache/pdf-fullscreen-render-browser.log`. Fullscreen canvas mounting is observed explicitly after each portal transition; verification waits for drawing to finish and checks the fictional PDF's rendered pixels. Desktop/mobile screenshots were inspected after correcting an initially blank redraw. Physical-device fullscreen behavior remains in the M5 gate.

## Review fix: unavailable Ordinary Time

Legacy neutral hymns convert only when Ordinary Time is active or already linked to that hymn. If conversion is unavailable, the editor retains the existing neutral flag and original season links, allows unrelated edits without demanding another season, and explains the retained any-season suitability. It does not inject a new inactive relationship. New hymns still require season selection. Regression coverage checks inactive, missing, active and retained-inactive Ordinary Time; all 11 hymn-form tests passed.
