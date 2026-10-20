# UX walkthrough and coordinator demo

**Status:** These M0 sketches preserve the original design intent; M1–M4 now have a working application and automated browser evidence. M4 adds confirmed finalize/reopen, real usage, and saved history; see the [M4 report](m4-report.md). Current M3 behavior is documented in the [README](../README.md) and [review notes](m3-picker-view-review.md). Human usability and physical-phone validation remain pending and are mandatory in M4.
**Purpose:** Establish what the first implementation should do before investing in components.  
**Review owner:** Implementation owner; eventual coordinator reviewer is not assigned.

## Shared interaction language

Use warm cream (`#FAF7F2`), burgundy (`#6B2334`), neutral dark text (`#262626`), and restrained gold detail (`#9B742F`). These are proposed tokens; measure actual foreground/background contrast before shipping. Status always has text/icon, not only color. Use readable system fonts, generous spacing, compact chips, and limited iconography.

Navigation: Dashboard, Hymn Library, Mass Planner, Mass History, Settings. Expose a destination only after its milestone works. Settings is Admin-only. Viewer sees reading actions but no edit/add controls. On desktop use a sidebar; at 390px use an accessible navigation drawer. No core action depends on hover or drag-and-drop.

Keep category labels supplied by the API. Long Arabic/Syriac/French titles wrap; title/first-line/note content uses sensible auto direction without reversing surrounding controls. Forms and interface labels remain in English for version 1.

## 1. Library — M2, usage additions M4

```text
┌ Navigation ──────┬ Hymn Library                         [Add hymn] ┐
│ Hymn Library    │ [Search titles, first lines, composers...     ] │
│ Mass Planner    │ Genre ▾  Season ▾  Placement ▾  Language ▾      │
│ Mass History    │ Tags ▾   Active ▾   Usage ▾                     │
│ Settings        │ [Easter ×] [Communion ×]       [Clear filters]  │
│                 │ 18 results       Sort: Title ▾    Page size:25 │
│                 │ Title / Language / Classification / Usage     │
│                 │ Example Hymn / Arabic / Traditional / Apr 12   │
│                 │ Neutral Table Hymn / French / Neutral / Never  │
│                 │                         [Previous] [Next]      │
└─────────────────┴────────────────────────────────────────────────┘
```

At M2 the usage control/column is absent; it arrives with real history in M4. Active filter defaults to Active; viewing Inactive/All is explicit. Filters use URL state. Easter excludes a neutral-only hymn unless the user switches to the recommendation context. Selected language Arabic/French means either language, while placement remains an AND condition.

**Mobile:** Search and `[Filters (2)]` above a card list. Drawer contains labeled multi-selects and clear-all. Each card shows title, language, relevant category chips, and (from M4) usage. Avoid a horizontally scrolling desktop table. Pagination remains explicit and reachable.

**States:** Initial empty library offers Add hymn when permitted. Zero results offers Clear filters. Loading shows skeletons and result count status. Failure shows Retry and retains query/filter state. Clicking a title opens detail; browser Back returns to the same filters/page.

## 2. Hymn form/detail — M2

```text
Add hymn                                              [Cancel]
Basic information
  Title*                 [                                  ]
  Alternate title        [                                  ]
  First line             [                                  ]
  Language*              [Choose active language           ▾ ]
  Composer / Arranger    [                ] [                ]
  Source / Number        [                ] [                ]
Classification
  Genres                 [Traditional ×] [Choose            ▾]
  Suitable placements*   [Communion ×] [Thanksgiving ×] [+    ]
  Suitable seasons       [Easter ×] [Choose                 ▾]
  Tags                   [Choose                           ▾]
Musical/reference information
  Key / Duration         [            ] [                   ]
  Audio / Sheet music    [URL                                ]
  Notes                  [                                  ]
                         [                                  ]
                         [Save hymn]
```

Require at least one season. Select Ordinary Time for a hymn suitable in every season; there is no separate season-neutral checkbox. Existing season-neutral hymns open with Ordinary Time selected, and saving uses that classification. Genres/tags remain optional. Each searchable select supports keyboard input, navigation, removal, and a clearly labeled close button. Show retained inactive values with `Inactive` text while excluding them from new choices.

**Mobile:** One column, real labels above each input, no tabs hiding errors. Sticky save area must not obscure the last field or focused control.

**Save failure:** Inline message `Unable to save. Your entries are still here.` with Retry; field-specific errors linked to inputs and focus moved to the first error/summary. Do not close the form. Warn on navigation if dirty. Detail shows all stored metadata and historical usages from M4; Admin alone sees active-state/delete actions.

## 3. Mass planner — M3, finalize/read-only M4

```text
Sunday Mass — April 19, 2026                  Draft • Saved
Date [2026-04-19]  Season [Easter ▾]  Title [optional title]
Notes [                                                      ]
3 placements filled • 8 empty (optional)      [Review / Finalize]

Entrance
  Arabic Peace Hymn                           [Notes] [Remove]
  [+ Add hymn]
Communion
  1. Example Hymn    Recently selected Apr 12  [↑] [↓] [Remove]
     Notes [First Communion hymn                            ]
  2. Old Communion Hymn                       [↑] [↓] [Remove]
  [+ Add hymn]
Thanksgiving
  Example Hymn       Also selected at Communion      [Remove]
  [+ Add hymn]
Other active sections ...
```

The illustrative section count is based on the eleven seeded placements; compute it from current configuration instead of hard-coding eleven. An inactive section with existing selections stays visible with `Inactive placement` text and no new-add action. Empty sections are optional, never portrayed as mandatory completion failures.

**Mobile:** Metadata stacks. Sections become full-width cards. Up/down controls replace drag dependence; buttons are usable by touch. Notes expand inline. Footer exposes save state and review without covering content. Dialogs return focus to their trigger.

**Saving:** Each change starts Unsaved → Saving → Saved after server acknowledgement. Coalesce rapid changes. On failure retain the working copy, show `Unable to save` and Retry, and disable finalization. Browser navigation warns while unsaved work remains.

**Conflict:** Show `This Mass changed in another session. Your edits have not been saved.` Provide View saved version and Review my changes; preserve the working copy. Reload is an explicit choice after review, never an automatic destructive refresh. No force-overwrite button bypasses revisions.

**Finalization (October 19):** The saved page already shows the program and its advisory notes. Finalize and the Edit pen sit at top right. Desktop hover/focus explains read-only state and usage before a direct finalization; narrow/touch screens require a short confirmation. Conflicting revisions require checking the refreshed program before another attempt. Finalized programs show a confirmed Edit pen for Planner/Admin, returning to draft before editing. Only Admin sees confirmed Delete; hymn records remain. Viewers have no mutation controls.

## 4. Hymn picker — All Hymns M3, Recommended M5

```text
Choose a hymn for Communion — Easter                  [Close]
[Recommended] [All Hymns]
Language [Any ▾] Genre [Any ▾]

Old Communion Hymn
English • Traditional
Suitable for Communion • Suitable for Easter
Last selected 105 days before this Mass                [Add]

Example Hymn
Arabic • Traditional
Suitable for Communion • Suitable for Easter
Selected 7 days before this Mass                       [Add]
```

Recommended opens by default only from M5. Scores are not the card headline. No season selected produces a visible `Season filtering unavailable` notice. Each row is selectable with an explicit Add button; adding does not remove the user's ability to continue browsing.

All Hymns exposes search/filter/sort over the active library without secretly enforcing the target season/placement. On mismatch, ask `This hymn is not marked for this placement/season. Add anyway?` and accept an explicit override. Recent use and duplication are contextual warnings, not blockers. Inactive hymns are not new choices.

**Current mobile behavior (October 10 review):** The placement expands an inline picker. Search and a Filters button sit above compact metadata rows in a bounded scroll area. The page remains scrollable; keyboard and touch can reach every choice. Escape/Close collapse the picker and focus returns to its Add/Change action. Choosing a hymn closes that section picker. Future M5 recommendations should use this same inline surface.

**Failure/empty:** Retry failed suggestions while All Hymns remains usable. No eligible recommendations offers All Hymns; do not silently expand eligibility. An empty library routes to Add hymn when permitted.

## 5. Category settings — M6

```text
Settings / Mass placements                            [Add]
Name                      Status      Order    Actions
Entrance / Processional   Active      [↑][↓]    [Edit]
Communion                 Active      [↑][↓]    [Edit]
Closing / Recessional     Inactive    [↑][↓]    [Edit]

Edit placement
Name [Communion              ]  Description [               ]
Active [✓]    Used by 6 hymns and 18 program selections
[Save]  [Deactivate]  [Delete if unreferenced]
```

The shared manager works for all five types. Reordering includes inactive rows to preserve full-list consistency. Usage counts in the example are placeholders in the sketch, not fixture statistics. API reference counts establish actual impact at runtime.

**Mobile:** Category cards with name/status, up/down, Edit. Accessible order change announces the new position. Confirm deactivation when in use; reject referenced deletion with a deactivation alternative. Renaming updates labels without rebuilding historical selections or altering category identity.

## 6. Coordinator walkthrough script

Use [the fixture guide](acceptance.md). The static M0 walkthrough can be evaluated now; the interactive steps become acceptance tests only when their milestone is implemented.

1. **Library pilot (A02–A04):** Add the required metadata example, search by alternate title/first line, select Easter + Communion + Traditional + Arabic, copy its URL, and reopen it. Explain why neutral-only is excluded from this literal library query.
2. **Planning pilot (A05–A07):** Create April 19, 2026 Easter Mass, choose two Communion hymns, reorder/add notes, refresh, then force a save failure. Confirm whether save feedback is clear and retry keeps work. Open two sessions to review a conflict.
3. **Manual weekly MVP (A08–A10):** Finalize April 12's program, inspect history/counts, reopen as Admin, and re-finalize. Read inactive historical rows and future scheduled entries.
4. **Assisted beta (A11–A13):** Open April 19 Communion recommendations. Compare old-use versus recent-use hymns; inspect reasons, then choose the recent one deliberately. Explain that recency is relative to the target Mass and excludes future/same-day programs.
5. **Settings (A14–A15):** Rename/reorder/deactivate a referenced placement, then inspect the old program. Attempt deletion and follow the safe alternative.
6. **Complete release (A16–A18):** Use dashboard, print the saved program, repeat core actions on mobile/keyboard, and time a typical five-placement planning session.

### Feedback to record

- Can the coordinator find a specific hymn without remembering an exact title?
- Are neutral-season versus explicit-season choices understandable?
- Are multiple Communion hymns and notes easy to manage?
- Is it evident whether the last edit is actually saved?
- Do warnings help without obstructing deliberate music choices?
- Are future finalized plans clearly labeled as scheduled?
- Does printed order match the saved program?

Record observed problems and requested changes with the affected milestone/ticket. There are no coordinator answers yet; do not record agreement or a measured planning time until someone actually performs the walkthrough.

## Current planning flow — October 10 review

### October 10 browser review

The Mass list now states when the last result has been reached and shows a return-to-top action once Create Mass starts scrolling above the viewport. Search explicitly describes finding saved titles/notes and belongs to the list, rather than the creation form.

Creation is a separate two-step flow: `/masses/new` confirms date, Maronite season, title and notes; Next creates the draft and opens hymn/order selection. Before creation, a fresh inclusive same-date lookup checks all saved plans regardless of list filters/status. Existing plans require explicit confirmation; cancellation or lookup failure preserves inputs and creates nothing. Multiple services on one date remain permitted. This is a client confirmation at the time of checking, not a transactional uniqueness constraint against concurrent creation.

The hymn step shows confirmed details read-only. Back to Mass details and Next switch the same mounted working copy, preserving hymn order, notes and the revision-guarded autosave queue. Each placement's + toggles a compact inline picker with search and a Filters button, scrollable results and metadata (language, placement, season suitability, genres/tags, key, duration, voices and sheet-music availability). Placement filtering and season/neutral preference remain server-side before pagination; mismatch/duplicate overrides and focus restoration remain explicit.

New selection identity uses a browser-session counter rather than the secure-context-only `crypto.randomUUID`. These keys identify unsaved rows locally and never serve as security tokens or database IDs. Both random and manual additions now work on an HTTP LAN origin.

**Deferred owner request — saved program for use during Mass:** recorded October 10; redesign has not started. Revisit the saved view to make it practical for accessing hymns and performing during the service: compact ordered navigation, quick access to lyrics/sheet-music PDFs/voice parts/audio where available, visible performance notes and straightforward movement between hymns. Agree the detailed layout later with the owner, then validate a complete rehearsal on a real phone with materials reachable during Mass. Keep this separate from the implemented planning review and from the still-pending physical-phone M4 gate.

## October 10 picker review — current implemented design

The compact inline picker now aligns Search and Filters and groups language, genre and sorting in one row. Desktop results are a semantic metadata table with sortable Title, Language, Seasons, Genres, Tags, Key, Minutes and Voices headings. Horizontal scrolling stays inside the table, with the Add column kept reachable. Phones use compact cards and the equivalent sort selector, avoiding a wide table on a narrow screen. Actual season names replace the vague “Other season” label; suitable neutral choices read “Any season”.

The sidebar music mark toggles a narrow navigation rail on desktop. Hymn order uses a drag handle per row, including touch pointer capture and viewport edge scrolling. Keyboard pickup/move/drop and cancellation are described to assistive technology; previews only persist on drop. Review [acceptance A10R](acceptance.md) and the [picker report](picker-review.md). Saved-program performance mode remains deferred.

## Mass list refinement

Mass plans starts with Ready Masses (finalized). Use Pending drafts to continue a saved draft. A compact search and Filters icon replace the large search panel. Clearing search/date/season preserves your selected list; switching lists preserves filters and starts at page one. Past records remain under Archived. The floating arrow returns to Create Mass. See [Mass list review](mass-list-review.md).

Date and season controls share a height; optional title/notes occupy separate rows. Desktop picker columns are tighter and use page scrolling; drag handles appear as plain icons. See [the refinement report](planning-refinement.md).

## October 20 reading update

Hymn detail now leads with key/tempo/voice count, PDF then lyrics; classification is concise and usage/date move into metadata. Edit is a labeled pen icon. The form uses burgundy required stars and optional Latin Characters Name for non-Latin titles, with lyrics/key/tempo beside sheet music.

Saved programs center and emphasize hymn titles. Focus mode opens a stable snapshot of selected hymns in program order: uploaded PDF, otherwise lyrics, otherwise title. Swipe or use previous/next/keyboard arrows; Exit/Escape releases the screen wake lock and returns to the saved program. Browser/system support determines whether the screen-awake request is granted. See [performance UI review](ui-performance-review.md) for verification and follow-up work; full Arabic translation and language settings remain deferred.
