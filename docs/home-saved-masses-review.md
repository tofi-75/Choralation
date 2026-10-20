# Home and saved Mass review — October 19, 2026

## Delivered behavior

- Home (`/`, via `/dashboard`) opens with the next finalized Mass and three more upcoming programs. Four newest active hymns appear below, with library/create links; Practice is marked Coming soon. Drafts and All Masses are available at the top.
- Saved Masses (`/masses`) use chronological upcoming ordering. Past finalized programs are available through Archived Masses (`/masses?archived=true`); each expands its complete hymn program on demand. Drafts (`/masses?status=draft`) remain separate. Search and optional date/season filters remain URL-backed and apply before pagination.
- Date input is capped at 13rem and constrained to its field, with a calendar icon. The random selector is a shuffle icon below the placement sections.
- Ordinary Time (`ordinary-time`) is suitable for every Mass season across warnings, season preference and random candidates. Literal library filters continue to match explicit links.
- Saved drafts place Finalize and Edit at the top right. Desktop hover/focus shows the read-only/usage explanation. Narrow or touch viewports require a small confirmation dialog.
- Finalized Edit is a pen, requires confirmation, and is available to Planner/Admin. It transitions back to draft before entering the existing editor; usage is excluded until re-finalization. Direct finalized metadata/program writes remain blocked.
- Finalized Delete is a trash icon, requires confirmation, and is Admin-only in both UI and backend. It removes only the Mass and its selections, preserving hymns. Every mutation checks the displayed revision; stale confirmations require refreshed-program acknowledgement.

## Verification

- Backend: 236 tests passed, including PostgreSQL concurrency, archive filtering before pagination, Ordinary Time suitability/random eligibility, role guards and revision-safe finalized deletion.
- Frontend: 68 unit tests passed, including home, saved-view actions, phone confirmation, and autosave/random regressions.
- Type checking, lint, formatting, migration consistency, API schema validation and production build passed. The existing Vite bundle-size advisory remains.
- Browser: **80 distinct scenarios verified across combined runs** at desktop (1280 px) and 360/390/430 px. The full 80-case run passed 72; eight cases used an immediate count before the lazy editor mounted or the old season-only random eligibility assertion. Those test expectations were corrected, and all eight affected cases passed in the focused rerun (1.9 minutes). This is combined verification, not a claim that the initial full run was entirely green.
- The new journey verifies recent hymns/home links, date containment/calendar icon, bottom shuffle control, Ordinary Time with no mismatch warning, desktop tooltip and phone confirmation, Planner confirmed edit, archived full hymn links, Admin cancel/confirm deletion, retained hymns and recomputed usage.
- Screenshots inspected at desktop and phone widths; all temporary run-owned accounts, programs and unreferenced hymns were cleaned up. Full/focused logs stay ignored under `.cache/home-ui-browser-full.log` and `.cache/home-ui-browser-focused.log`; screenshots/traces stay under ignored `frontend/test-results/`.

No provider settings, credentials, hosted records, Git staging, commits, pushes or live deployments are part of this update. Physical-phone acceptance remains deferred to M5.
