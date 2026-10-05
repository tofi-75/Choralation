# Codex Build Specification — Mass Hymn Picker

## 1. Role and Objective

You are acting as the lead full-stack engineer for a production-quality web application called **Mass Hymn Picker**.

Build a complete, maintainable **Django + React** application that helps a church music team:

1. Maintain a structured hymn library.
2. Classify hymns by musical genre, liturgical season, Mass placement, language, and tags.
3. Search and filter the hymn library quickly.
4. Prepare the hymn program for each Sunday Mass.
5. Track when hymns were previously used.
6. Recommend appropriate hymns while avoiding unnecessary repetition.
7. Manage all classification categories through the application rather than hard-coding them.

The application should be useful with a small hymn library but must also remain comfortable to use with hundreds or a few thousand hymns.

This document is the authoritative functional and technical specification for the initial application. Where a minor implementation detail is not explicitly defined, choose the simplest maintainable solution that is consistent with the architecture and user experience described here.

Do not reduce the project to a static prototype. Build the actual data model, API, persistence, forms, filters, history, and recommendation logic.

---

# 2. Product Vision

The normal weekly workflow should be:

**Add hymns → classify hymns → create a Sunday Mass → choose hymns for each Mass placement → save/finalize the Mass → automatically use that history to improve future hymn suggestions.**

A user should be able to prepare the music for a normal Sunday Mass in only a few minutes.

The system should answer practical questions such as:

- Which hymns are appropriate for Communion during Easter?
- Which Thanksgiving hymns have not been used recently?
- Which Entrance hymns are suitable for Advent?
- What did we sing during the last six Sundays?
- When was a particular hymn last used?
- Which hymns are suitable for both Communion and Thanksgiving?
- Which hymns are available in Arabic, French, or English?
- Which suitable hymns have never been used?
- Which hymns should I consider this Sunday based on the Mass placement, season, and recent history?

---

# 3. Core Product Principles

The application must follow these principles.

## 3.1 Categories are independent

Do not model one large "category" field.

A hymn can independently have:

- one or more genres;
- one or more suitable liturgical seasons;
- one or more suitable placements during Mass;
- one language;
- zero or more tags.

For example, the same hymn may be:

- Genre: Traditional, Marian
- Season: Ordinary Time, Marian feast period
- Placement: Entrance, Communion, Closing
- Language: Arabic
- Tags: Mary, prayer, procession

These dimensions must remain independent so users can combine filters.

## 3.2 Most classifications are many-to-many

A hymn may belong to multiple genres, seasons, placements, and tags.

Do not create fields such as `genre_1`, `genre_2`, `season_1`, or fixed Boolean columns such as `is_communion`.

Use normalized relational tables and many-to-many relationships.

## 3.3 Categories must be editable

Do not hard-code genre names, season names, Mass placements, tags, or languages into frontend components or backend business logic.

Initial default records may be seeded, but authorized users must be able to add, rename, reorder, activate/deactivate, and where safe delete categories.

## 3.4 History must come from actual Mass plans

Do not manually maintain fields such as "times used" or "last used" in a way that can become inconsistent.

Usage count and last-used date should be derived from saved Mass hymn selections.

## 3.5 Recommendations must be explainable

If the application recommends a hymn, the user should be able to understand why.

Example explanation:

> Suitable for Communion • Suitable for Easter • Last used 84 days ago

Avoid opaque AI recommendations in the first version. Use deterministic business rules.

---

# 4. Required Technology Stack

Use a monorepo with a Django REST backend and React frontend.

## Backend

Use:

- Python 3.12+ or the latest stable supported Python version
- Django
- Django REST Framework
- PostgreSQL
- `django-filter`
- `django-cors-headers` only if needed by the chosen local development setup
- `drf-spectacular` or equivalent for OpenAPI documentation
- `psycopg`
- Gunicorn for production serving

Choose current stable package versions at implementation time and pin them.

Prefer Django's built-in authentication and session system unless there is a strong architectural reason not to.

For local React development, configure the Vite development server to proxy `/api` to Django so that the application can use normal same-origin Django session authentication and CSRF protection.

## Frontend

Use:

- React
- TypeScript
- Vite
- React Router
- TanStack Query
- React Hook Form
- Zod
- Tailwind CSS
- a small accessible component system such as shadcn/ui, Radix primitives, or well-structured custom components

Do not introduce Redux unless a concrete requirement cannot be handled cleanly with TanStack Query and local component state.

## Testing

Use:

### Backend
- pytest
- pytest-django

### Frontend
- Vitest
- React Testing Library

### End-to-end
Use Playwright for a small set of critical workflows if practical.

## Code quality

Configure:

### Python
- Ruff
- Black or Ruff formatting
- type hints for business/service-layer code where useful

### TypeScript
- ESLint
- Prettier

---

# 5. Suggested Repository Structure

Use a structure similar to:

```text
mass-hymn-picker/
├── backend/
│   ├── manage.py
│   ├── config/
│   ├── hymns/
│   ├── masses/
│   ├── accounts/
│   ├── common/
│   ├── requirements/
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── hymns/
│   │   │   ├── masses/
│   │   │   ├── settings/
│   │   │   └── dashboard/
│   │   ├── hooks/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── schemas/
│   │   ├── types/
│   │   └── utils/
│   ├── tests/
│   └── vite.config.ts
├── docs/
│   ├── architecture.md
│   └── api.md
├── docker-compose.yml
├── .env.example
├── README.md
└── Makefile
```

The exact directories may differ slightly, but keep feature boundaries clear.

---

# 6. Domain Model

Implement the following primary entities.

---

## 6.1 User

Use Django's normal user model or a small custom user model created at the beginning of the project if needed.

Support three logical roles:

### Admin
Can:

- manage hymns;
- manage category settings;
- create and edit Mass plans;
- finalize Mass plans;
- manage users if user administration is included.

### Planner
Can:

- view the hymn library;
- add/edit hymns;
- create and edit Mass plans;
- view history;
- use recommendations.

Cannot perform destructive administrative actions such as deleting category definitions that affect other records.

### Viewer
Read-only access.

If full role management would add excessive scope to the first implementation, implement Admin and authenticated standard users first, but structure permissions so roles can be expanded later.

---

# 7. Classification Models

Every classification table should contain at minimum:

- `id`
- `name`
- `slug`
- `description` nullable
- `is_active`
- `display_order`
- `created_at`
- `updated_at`

Names should be unique case-insensitively where practical.

Do not silently delete a category that is already referenced by hymns or historical Mass data. Prefer deactivation or reject deletion with a useful validation message.

---

## 7.1 Genre

Examples for seed data:

- Traditional
- Contemporary
- Chant
- Worship
- Marian
- Praise
- Meditative

Genre describes musical or devotional style.

Do not use Genre as a substitute for Mass placement.

---

## 7.2 LiturgicalSeason

Examples for seed data:

- Ordinary Time
- Advent
- Christmas
- Lent
- Holy Week
- Easter
- Pentecost

The administrator must be able to change these records.

A hymn may be suitable for multiple seasons.

Add a Boolean field on `Hymn` called:

`is_season_neutral`

When true, the hymn may be recommended regardless of season.

When false, at least one suitable season should normally be selected.

Do not automatically calculate the Catholic liturgical calendar in the first version. When a Mass is created, let the user choose the liturgical season manually. The architecture should allow future automatic season suggestions.

---

## 7.3 MassPlacement

This is one of the most important models.

Seed the application with:

1. Entrance / Processional
2. Opening Hymn
3. Psalm
4. Gospel Acclamation
5. Sermon / Reflection
6. Offertory
7. Anthem
8. Communion
9. Thanksgiving
10. Meditation
11. Closing / Recessional

Each placement should have:

- name
- description
- display order
- whether it is active

The application must not assume that there is exactly one hymn per placement.

For example, Communion may contain two hymns.

---

## 7.4 Language

Seed common examples:

- Arabic
- English
- French
- Syriac

But allow administrators to add or deactivate languages.

A hymn has one primary language in version 1.

The schema should not make future multilingual hymn variants impossible.

---

## 7.5 Tag

Tags are optional flexible labels.

Examples:

- Mary
- Eucharist
- Resurrection
- Peace
- Youth
- Procession
- Prayer
- Joy
- Repentance

Tags must not replace the structured genre/season/placement fields.

---

# 8. Hymn Model

Create a `Hymn` model with at least:

```text
id
title
alternate_title              nullable
first_line                   nullable
composer                     nullable
arranger                     nullable
language_id
notes                         nullable
source_or_hymnal             nullable
hymnal_number                nullable
default_key                  nullable
estimated_duration_minutes   nullable
audio_url                    nullable
sheet_music_url              nullable
is_season_neutral
is_active
created_at
updated_at
created_by                   nullable
updated_by                   nullable
```

Relations:

```text
Hymn <-> Genre           many-to-many
Hymn <-> LiturgicalSeason many-to-many
Hymn <-> MassPlacement   many-to-many
Hymn <-> Tag             many-to-many
Hymn -> Language         foreign key
```

### Search behavior

A normal search should match at minimum:

- title;
- alternate title;
- first line;
- composer;
- source/hymnal;
- tags.

Search should be case-insensitive.

For the expected data volume, a simple PostgreSQL search implementation is acceptable. Do not over-engineer full-text search unless it is easy to maintain.

### Computed hymn fields

The hymn API should return:

- `usage_count`
- `last_used_date`
- optionally `days_since_last_used`

These values are derived from Mass history.

---

# 9. Mass Model

Create a `Mass` model with:

```text
id
date
title                        nullable
liturgical_season_id         nullable
notes                        nullable
status                       draft | finalized
created_by
updated_by
created_at
updated_at
finalized_at                 nullable
```

Default generated title if none is entered:

`Sunday Mass — <formatted date>`

Do not require every Mass to occur on Sunday. Sunday is the primary use case, but future special Masses should remain possible.

---

# 10. Mass Hymn Selection Model

Create a normalized model such as `MassHymnSelection`.

Fields:

```text
id
mass_id
placement_id
hymn_id
position
notes                  nullable
created_at
updated_at
```

`position` determines the order of hymns inside the same placement.

Example:

```text
Communion
  1. Hymn A
  2. Hymn B
```

Historical Mass selections must remain stable even if the hymn later receives different categories.

Do not delete historical selections automatically when a hymn is deactivated.

The planner should still be able to see the name of an inactive hymn in old Mass history.

---

# 11. Database Constraints and Integrity

Implement sensible constraints.

Examples:

- category slugs unique;
- category display order non-negative;
- Mass hymn `position` non-negative;
- no duplicate identical hymn entry at the same placement/position;
- a selected hymn must exist;
- inactive hymns cannot normally be newly added to a Mass;
- finalized Masses should not be silently edited.

For finalized Masses, choose one of these patterns and document it:

1. Admin can explicitly reopen a finalized Mass; or
2. editing a finalized Mass requires an explicit confirmation and returns it to draft.

Prefer the **reopen** workflow.

---

# 12. Backend Architecture

Use a conventional Django/DRF architecture.

Keep:

- database models in models;
- serialization in serializers;
- request/HTTP concerns in viewsets/views;
- recommendation ranking and other non-trivial business rules in services/selectors;
- reusable query logic in QuerySets/managers or selector functions.

Do not place large blocks of recommendation logic inside React.

The backend is the source of truth.

---

# 13. Required API

Use `/api/v1/` as the base path.

Document the API through OpenAPI.

A suggested endpoint design follows.

---

## 13.1 Authentication

```text
POST /api/v1/auth/login/
POST /api/v1/auth/logout/
GET  /api/v1/auth/me/
```

If session authentication is used, ensure CSRF behavior is handled correctly in the React client.

---

## 13.2 Hymns

```text
GET    /api/v1/hymns/
POST   /api/v1/hymns/
GET    /api/v1/hymns/{id}/
PATCH  /api/v1/hymns/{id}/
DELETE /api/v1/hymns/{id}/
GET    /api/v1/hymns/{id}/usage/
```

Prefer soft deactivation over destructive deletion when the hymn has usage history.

### Hymn list filters

Support combinations of:

```text
?q=
&genres=
&seasons=
&placements=
&languages=
&tags=
&is_active=
&used_after=
&used_before=
&not_used_since=
&never_used=
&ordering=
```

Multiple selected IDs can use repeated query parameters or a documented comma-separated format.

Examples:

```text
/api/v1/hymns/?placements=8&seasons=4
/api/v1/hymns/?q=mary&languages=1
/api/v1/hymns/?placements=8&not_used_since=2026-08-01
```

Support useful ordering options:

- title;
- recently used;
- least recently used;
- most used;
- least used;
- newest added.

---

## 13.3 Categories

Provide normal CRUD endpoints for:

```text
/api/v1/genres/
/api/v1/liturgical-seasons/
/api/v1/mass-placements/
/api/v1/languages/
/api/v1/tags/
```

Support reordering.

Deletion rules must preserve referential integrity.

---

## 13.4 Masses

```text
GET    /api/v1/masses/
POST   /api/v1/masses/
GET    /api/v1/masses/{id}/
PATCH  /api/v1/masses/{id}/
DELETE /api/v1/masses/{id}/
POST   /api/v1/masses/{id}/finalize/
POST   /api/v1/masses/{id}/reopen/
```

Support date filtering:

```text
?from=
?to=
?status=
?season=
```

---

## 13.5 Mass selections

Either use nested endpoints:

```text
POST   /api/v1/masses/{id}/selections/
PATCH  /api/v1/masses/{id}/selections/{selection_id}/
DELETE /api/v1/masses/{id}/selections/{selection_id}/
```

or a bulk update endpoint if that gives a better planner experience.

A bulk endpoint is encouraged:

```text
PUT /api/v1/masses/{id}/program/
```

with a payload such as:

```json
{
  "selections": [
    {
      "placement_id": 1,
      "hymn_id": 41,
      "position": 0,
      "notes": ""
    },
    {
      "placement_id": 8,
      "hymn_id": 17,
      "position": 0,
      "notes": ""
    }
  ]
}
```

The update must be atomic.

---

## 13.6 Recommendations

Provide:

```text
GET /api/v1/masses/{mass_id}/recommendations/?placement_id={id}
```

Optional parameters:

```text
&genre_ids=
&language_ids=
&limit=20
```

Response should include:

```json
{
  "results": [
    {
      "hymn": {
        "id": 17,
        "title": "Example Hymn"
      },
      "score": 85,
      "reasons": [
        "Suitable for Communion",
        "Suitable for Easter",
        "Last used 84 days ago"
      ],
      "usage_count": 7,
      "last_used_date": "2026-07-12"
    }
  ]
}
```

Do not expose internal implementation details that are unnecessary for the UI, but do provide human-readable reasons.

---

## 13.7 Dashboard

Provide a compact endpoint if it makes the frontend simpler:

```text
GET /api/v1/dashboard/
```

Possible response:

```json
{
  "upcoming_mass": {},
  "recent_masses": [],
  "recently_used_hymns": [],
  "season_suggestions": []
}
```

Avoid duplicating large amounts of data if normal endpoints already make the page easy to implement.

---

# 14. Recommendation Engine

Build a deterministic recommendation service.

It must prioritize:

1. suitability for the selected Mass placement;
2. suitability for the Mass's liturgical season;
3. hymns that have not been used recently;
4. active hymns.

Do not use an LLM.

---

## 14.1 Eligibility

A hymn is normally eligible when:

- `is_active = true`;
- it is assigned to the requested Mass placement;
- it is season-neutral OR is assigned to the Mass's selected liturgical season.

If a Mass has no selected season, placement-matching season-neutral hymns and placement-matching hymns from any season may be shown, but clearly label that season filtering is unavailable.

---

## 14.2 Suggested scoring model

Implement the score in one backend service module and cover it with tests.

A reasonable starting model:

```text
+50  placement matches
+30  selected season matches
+15  hymn is season-neutral
+20  hymn has never been used
+15  last used > 90 days ago
+10  last used 61–90 days ago
+5   last used 31–60 days ago
-10  last used 15–30 days ago
-30  last used 8–14 days ago
-60  last used within the last 7 days
```

If the hymn is already selected elsewhere in the current Mass:

```text
-100
```

This is a starting rule, not a sacred constant. Keep weights defined in one place so they are easy to adjust.

Tie breakers:

1. hymn never used;
2. oldest `last_used_date`;
3. lower historical usage count;
4. alphabetical title.

---

## 14.3 Recommendation explanations

Generate concise explanations from the same facts used for scoring.

Examples:

- Suitable for Communion
- Suitable for Easter
- Season-neutral
- Never used before
- Last used 105 days ago
- Used 3 times
- Recently used 6 days ago

Do not show the numeric score prominently to end users unless useful for debugging.

---

# 15. Duplicate and Repetition Warnings

The Mass planner should warn, but not block, when:

- the same hymn is selected twice in the current Mass;
- a selected hymn was used last Sunday;
- a selected hymn was used very recently.

Suggested UI:

> Recently used — this hymn was last used 7 days ago.

The user must be able to override the warning.

Do not prevent valid pastoral or musical decisions simply because the hymn was recently used.

---

# 16. Frontend Information Architecture

Primary navigation:

```text
Dashboard
Hymn Library
Mass Planner
Mass History
Settings
```

On desktop use a left sidebar or compact top navigation.

On mobile use a responsive navigation drawer or bottom-compatible menu.

---

# 17. Dashboard

The dashboard should provide practical weekly information, not generic analytics.

Include:

## Upcoming Mass

Show the next future Mass:

- date;
- liturgical season;
- draft/finalized status;
- completion state;
- selected hymns grouped by placement.

Actions:

- Open planner
- Continue planning
- View finalized Mass

## Quick Hymn Search

Provide a compact search field that navigates to the library with the search query.

## Recently Used Hymns

Show a short list of hymns from recent Masses with:

- title;
- placement;
- last-used date.

## Suggested Hymns

When an upcoming Mass has a season, show a small group of hymns suitable for that season that have not been used recently.

Do not make the dashboard visually crowded.

---

# 18. Hymn Library Page

This is a core screen.

Desktop layout should contain:

- page title;
- Add Hymn button;
- search;
- filter controls;
- active filter chips;
- result count;
- list/table/card result view.

Suggested columns on desktop:

```text
Title
Language
Genres
Placements
Seasons
Last Used
Times Used
Actions
```

On mobile use cards rather than a wide table.

## Required filters

- Search
- Genre
- Liturgical season
- Mass placement
- Language
- Tags
- Active/inactive
- Usage recency

Filters must combine using AND across dimensions.

Example:

```text
Season = Easter
Placement = Communion
Genre = Traditional
```

should return hymns satisfying all selected dimensions.

For multiple selections inside one dimension, use OR unless clearly documented otherwise.

Example:

```text
Language = Arabic OR French
AND
Placement = Communion
```

## Filter URL state

Persist search/filter state in the URL query string so filtered library views can be bookmarked and browser navigation works naturally.

---

# 19. Hymn Detail Page

Provide a dedicated detail page or full-size drawer.

Show:

- title;
- alternate title;
- language;
- genres;
- placements;
- seasons;
- tags;
- optional metadata;
- notes;
- usage count;
- last used;
- recent usage history.

Actions:

- Edit
- Deactivate
- Delete only if safe

Usage history example:

```text
Sep 27, 2026 — Communion
Sep 06, 2026 — Thanksgiving
Jul 12, 2026 — Closing
```

---

# 20. Add/Edit Hymn Form

Use a clean form with sections.

## Basic Information

- Title — required
- Alternate title
- First line
- Language — required
- Composer
- Arranger
- Source/hymnal
- Hymnal number

## Classification

- Genres — searchable multi-select
- Suitable Mass placements — searchable multi-select
- Suitable liturgical seasons — searchable multi-select
- Season-neutral checkbox
- Tags — searchable multi-select

## Musical/Reference Information

- Default key
- Estimated duration
- Audio URL
- Sheet music URL
- Notes

## Validation

Require:

- title;
- language;
- at least one Mass placement.

If `is_season_neutral = false`, require at least one season unless an administrator explicitly allows unclassified records.

Display backend validation errors next to the relevant field.

---

# 21. Mass Planner

This is the primary weekly workflow.

The Mass Planner must feel fast and purpose-built.

---

## 21.1 Create Mass

Fields:

- date;
- title optional;
- liturgical season;
- notes.

When the user selects a date, do not silently assume the season. If automatic liturgical season support is added later, present it as a suggestion that the user can change.

---

## 21.2 Planner Layout

Show Mass placements in configured display order.

Example:

```text
Entrance
[ selected hymn ]
[ + Add hymn ]

Offertory
[ selected hymn ]
[ + Add hymn ]

Anthem
[ selected hymn ]
[ + Add hymn ]

Communion
[ selected hymn ]
[ selected hymn ]
[ + Add hymn ]

Thanksgiving
[ + Add hymn ]

Closing
[ selected hymn ]
[ + Add hymn ]
```

Do not force every configured placement to be used.

Allow:

- add hymn;
- remove hymn;
- reorder within a placement;
- edit selection notes;
- choose more than one hymn for a placement.

---

# 22. Hymn Picker Drawer / Modal

Clicking **Add hymn** should open a fast selection interface.

At the top show context:

```text
Choose a hymn for:
Communion
Easter
```

Tabs:

```text
Recommended
All Hymns
```

## Recommended tab

Each suggestion card should show:

- hymn title;
- language;
- genres;
- relevant season labels;
- last-used status;
- short reason text.

Example:

```text
Example Hymn
Traditional • Arabic

Suitable for Communion • Easter
Last used 84 days ago
```

Clicking a hymn adds it immediately.

## All Hymns tab

Allow:

- text search;
- filtering;
- sorting;
- selection from the full library.

Do not prevent manual selection of a hymn simply because it is not classified for the active season. Show a soft warning instead.

Example:

> This hymn is not currently marked as suitable for Easter. Add anyway?

---

# 23. Saving Behavior

Do not risk losing the user's weekly plan.

Use one of these approaches:

- autosave after each planner mutation; or
- clear save state with frequent background saving.

Autosave is preferred.

Show a subtle state such as:

```text
Saving…
Saved
Unable to save
```

Do not use intrusive success notifications for every small change.

---

# 24. Finalizing a Mass

A Mass begins as a draft.

The user can finalize it.

Before finalization, optionally show a compact review:

```text
Entrance        Hymn A
Offertory       Hymn B
Communion       Hymn C, Hymn D
Thanksgiving    Hymn E
Closing         Hymn F
```

Finalization should:

- set status to finalized;
- record `finalized_at`;
- preserve the program as historical usage.

Finalization does not need to freeze foreign category labels as snapshots in version 1, but the hymn selections themselves must remain preserved.

A finalized Mass should clearly look different from a draft.

---

# 25. Mass History

Create a page for previously planned Masses.

Features:

- date range filter;
- season filter;
- status filter;
- text search if title/notes are used;
- newest-first list.

Each Mass card/row shows:

- date;
- season;
- status;
- number of hymn selections;
- compact hymn preview.

Clicking opens the full Mass program.

---

# 26. Settings

Create category management pages.

Sections:

```text
Genres
Liturgical Seasons
Mass Placements
Languages
Tags
```

For each category support:

- add;
- rename;
- edit description;
- change display order;
- activate/deactivate;
- delete if safe.

For Mass placements, make ordering especially easy.

A basic up/down control is sufficient; drag-and-drop is optional.

---

# 27. Visual Design

The interface should be modern, calm, and respectful.

Avoid a dated "church website" appearance.

Use a restrained liturgical-inspired palette:

- warm white or cream background;
- deep burgundy or dark navy as primary accent;
- subtle gold for selected/highlight details;
- neutral gray text and borders.

Use:

- generous whitespace;
- readable typography;
- rounded cards;
- subtle shadows;
- accessible contrast;
- restrained icon use.

Do not overload the interface with religious illustrations.

The product should feel primarily like an efficient planning tool.

---

# 28. Responsive Design

The application must work comfortably on:

- desktop;
- tablet;
- mobile.

The Hymn Library and Mass Planner are especially important on mobile.

On small screens:

- stack filters;
- use a filter drawer;
- convert wide tables to cards;
- keep primary actions thumb-friendly;
- avoid horizontal scrolling wherever possible.

---

# 29. Accessibility

Implement basic accessibility correctly.

Requirements:

- semantic labels;
- keyboard navigation;
- visible focus states;
- accessible dialog/modal behavior;
- buttons are real buttons;
- sufficient color contrast;
- no status communicated by color alone;
- form errors connected to their inputs.

---

# 30. Loading, Empty, and Error States

Every major screen needs deliberate states.

Examples:

## Empty Hymn Library

> No hymns yet. Add your first hymn to begin building the library.

## No filter results

> No hymns match these filters.

Offer:

`Clear filters`

## No upcoming Mass

> No upcoming Mass is planned.

Offer:

`Create Mass`

## Failed request

Show a useful retry action.

Do not leave pages blank.

---

# 31. Seed Data

Provide a Django management command or data migration to seed initial category values.

Example command:

```bash
python manage.py seed_initial_data
```

Seed:

### Genres
- Traditional
- Contemporary
- Chant
- Worship
- Marian
- Praise
- Meditative

### Seasons
- Ordinary Time
- Advent
- Christmas
- Lent
- Holy Week
- Easter
- Pentecost

### Placements
- Entrance / Processional
- Opening Hymn
- Psalm
- Gospel Acclamation
- Sermon / Reflection
- Offertory
- Anthem
- Communion
- Thanksgiving
- Meditation
- Closing / Recessional

### Languages
- Arabic
- English
- French
- Syriac

Do not seed a large fake hymn library.

A few clearly marked demo hymns may be provided only for local development.

---

# 32. Import/Export — Phase 2 Foundation

Do not let import/export block the core application.

However, structure the domain so a later phase can support:

- CSV hymn import;
- CSV/Excel export;
- duplicate detection;
- category mapping.

If easy, include a CSV export of the hymn library in v1.

Do not implement a complex import wizard unless the core app is already complete.

---

# 33. Auditability

Use `created_at` and `updated_at` on important models.

Where practical, store `created_by` and `updated_by`.

A full audit-log framework is not required for version 1.

---

# 34. Performance Expectations

Expected scale:

```text
Hymns:             100–5,000
Masses:            hundreds to a few thousand
Selections:        tens of thousands at most
Users:             small team
```

Optimize appropriately but do not over-engineer.

Use:

- `select_related`;
- `prefetch_related`;
- annotations for usage statistics;
- pagination;
- indexes on frequently filtered fields.

Avoid N+1 queries.

---

# 35. Pagination

Hymn list should support server-side pagination.

Suggested page size:

```text
25
```

Allow:

```text
25
50
100
```

Recommendations do not require pagination; return a limited ranked set.

---

# 36. Date Handling

Store dates and timestamps correctly.

Use timezone-aware timestamps.

Mass uses a calendar `date`.

Show dates in a friendly local format in the UI while keeping API values ISO 8601.

---

# 37. Validation Rules

At minimum:

## Hymn

- non-empty title;
- valid language;
- at least one active Mass placement;
- valid URLs when URLs are provided;
- positive duration when provided;
- season-neutral logic validated.

## Mass

- valid date;
- valid season if provided.

## Selection

- mass exists;
- hymn exists;
- placement exists;
- placement is active for new selections;
- hymn is active for new selections;
- non-negative position.

A hymn does not have to be classified for the selected placement if the planner explicitly overrides a warning, but the normal picker should recommend classified hymns first.

---

# 38. API Error Shape

Return predictable error responses.

Example:

```json
{
  "detail": "Validation failed.",
  "errors": {
    "title": ["This field is required."]
  }
}
```

The React client should display field errors where possible.

---

# 39. Frontend API Layer

Centralize HTTP calls.

Do not scatter raw `fetch()` calls throughout page components.

Use a small typed API client.

Organize query keys consistently.

Examples:

```text
["hymns", filters]
["hymn", hymnId]
["masses", filters]
["mass", massId]
["recommendations", massId, placementId]
["categories", "genres"]
```

Invalidate the minimum necessary queries after mutations.

---

# 40. Frontend Type Safety

Define TypeScript types for all important API resources.

Use Zod for:

- form validation;
- parsing critical API shapes where useful.

Do not use `any` as a shortcut for domain models.

---

# 41. URL Routes

Suggested frontend routes:

```text
/login

/
 /dashboard

/hymns
/hymns/new
/hymns/:id
/hymns/:id/edit

/masses
/masses/new
/masses/:id
/masses/:id/plan

/history

/settings
/settings/genres
/settings/seasons
/settings/placements
/settings/languages
/settings/tags
```

Redirect `/` to `/dashboard` for authenticated users.

---

# 42. Permissions

Enforce authorization on the backend.

Do not rely on hidden frontend buttons for security.

Suggested rules:

### Viewer
GET only.

### Planner
Can:
- create/update hymns;
- create/update draft Masses;
- finalize Masses.

### Admin
All Planner privileges plus:
- manage categories;
- deactivate records;
- reopen finalized Masses;
- destructive deletes where permitted.

If user-role management is deferred, document that clearly.

---

# 43. Destructive Actions

Use confirmation dialogs for:

- deleting a hymn;
- deactivating a category heavily in use;
- deleting a draft Mass;
- reopening a finalized Mass if that can affect history.

Prefer archive/deactivate semantics when historical data exists.

---

# 44. Tests — Backend

Write meaningful tests.

At minimum cover:

## Model tests
- category uniqueness;
- season-neutral validation;
- Mass selection ordering;
- finalized Mass behavior.

## API tests
- auth permissions;
- hymn CRUD;
- combined hymn filters;
- category CRUD;
- Mass CRUD;
- Mass program update;
- finalization;
- history.

## Recommendation tests
Verify:

- correct placement ranks;
- correct season behavior;
- season-neutral behavior;
- never-used boost;
- recent-use penalty;
- current-Mass duplicate penalty;
- tie breakers.

Do not only test happy paths.

---

# 45. Tests — Frontend

At minimum cover:

- Hymn Library filter interactions;
- Add/Edit Hymn validation;
- Mass Planner adding/removing a hymn;
- recommendation display;
- recent-use warning;
- settings category form.

Use component/integration tests rather than brittle implementation-detail tests.

---

# 46. End-to-End Critical Flow

If Playwright is included, implement at least one full workflow:

```text
Login
→ Add a hymn
→ Create a Mass
→ Choose season
→ Add hymn to a placement
→ Finalize Mass
→ Open Hymn Library
→ Confirm last-used history is visible
```

A second useful flow:

```text
Create another Mass
→ Open recommendations
→ Confirm the previously used hymn is ranked lower because it was used recently
```

---

# 47. Developer Experience

Provide:

- `.env.example`;
- database setup;
- clear migration commands;
- seed command;
- backend start command;
- frontend start command;
- test commands;
- lint commands.

A new developer should be able to start the application from the README without guessing.

---

# 48. Environment Variables

At minimum:

```text
DJANGO_SECRET_KEY=
DJANGO_DEBUG=
DJANGO_ALLOWED_HOSTS=
DATABASE_URL=
CSRF_TRUSTED_ORIGINS=
```

Add variables only when necessary.

Never commit real secrets.

---

# 49. Docker

Provide local Docker support.

Minimum:

```text
postgres
backend
```

The frontend may run locally through Vite or through Docker.

Prefer a simple developer experience over a complex container topology.

A standard workflow should be possible with something similar to:

```bash
docker compose up -d db
cd backend
python manage.py migrate
python manage.py seed_initial_data
python manage.py runserver

cd frontend
npm install
npm run dev
```

If you provide a one-command Docker setup, keep the normal non-Docker commands documented too.

---

# 50. README

The project README must contain:

1. Project overview
2. Architecture summary
3. Prerequisites
4. Environment setup
5. Database setup
6. Backend setup
7. Frontend setup
8. Seed command
9. How to create the first admin
10. How to run tests
11. How to run linters
12. Main application workflow
13. Important design decisions

---

# 51. Optional Demo Data

For development only, optionally add:

```bash
python manage.py seed_demo_data
```

It may create:

- 15–20 fictional hymn records;
- 5 historical Masses;
- realistic category associations.

Clearly label them as demo data.

Do not mix demo data into the production seed command.

---

# 52. Features Explicitly Out of Scope for Initial Version

Do not let these delay the core application:

- AI-generated hymn recommendations;
- automatic scraping of hymn lyrics;
- copyrighted lyrics library;
- automatic liturgical calendar engine;
- Spotify/YouTube integrations;
- sheet music rendering;
- choir attendance;
- instrument scheduling;
- push notifications;
- public congregation access;
- native mobile app;
- complex analytics dashboards;
- multi-parish tenancy.

The data model should not unnecessarily prevent future expansion, but version 1 should stay focused.

---

# 53. Future-Friendly Extensions

The architecture should make these possible later:

## Automatic liturgical calendar
Suggest season/feast from date.

## Multiple parishes or choirs
Introduce organization/workspace ownership.

## Multiple language versions of the same hymn
Add a parent composition/work relationship.

## Setlists
Reusable hymn groups.

## Musicians
Assign cantor, organist, choir, instruments.

## Attachments
PDF sheet music or audio rehearsal files.

## Import
Bulk spreadsheet ingestion.

## Analytics
Season usage, repetition patterns, most/least used hymns.

Do not implement these unless the core specification is complete.

---

# 54. UX Details That Matter

These small behaviors are important.

## Library filters
A user should be able to clear all filters with one action.

## Recent usage
Always display a friendly value:

```text
Never used
7 days ago
Sep 6, 2026
```

Use exact date in detail views and human-friendly relative information where helpful.

## Chips
Genres, seasons, placements, and tags can be shown as compact chips.

## Search
Debounce search input slightly, around 250–400 ms.

## Forms
Do not lose entered form content because a server request failed.

## Navigation
Warn before leaving an unsaved complex form if autosave is not used.

## Mobile
Do not require hover interactions.

---

# 55. Mass Completion Indicator

On the Mass Planner, display a compact completion summary.

Example:

```text
5 placements filled
2 empty
```

Do not assume every placement must be filled.

Allow the user to optionally mark a placement as intentionally unused if later needed, but this is not required in the initial version.

---

# 56. Print-Friendly Mass Program

Include a simple print view in version 1 if reasonably straightforward.

Example route:

```text
/masses/:id/print
```

It should show:

```text
Sunday Mass — October 11, 2026
Ordinary Time

Entrance
Hymn A

Offertory
Hymn B

Communion
Hymn C
Hymn D

Thanksgiving
Hymn E

Closing
Hymn F
```

Use print CSS.

No elaborate PDF generation is required.

---

# 57. Suggested Backend Apps

One sensible decomposition:

```text
accounts
hymns
masses
common
```

### `hymns`
Contains:

- Hymn
- Genre
- LiturgicalSeason
- MassPlacement
- Language
- Tag

### `masses`
Contains:

- Mass
- MassHymnSelection
- recommendation service

Do not create a Django app for every single model.

---

# 58. Recommendation Service Interface

Create a clear service function, for example:

```python
get_hymn_recommendations(
    *,
    mass: Mass,
    placement: MassPlacement,
    limit: int = 20,
    genre_ids: list[int] | None = None,
    language_ids: list[int] | None = None,
) -> list[HymnRecommendation]
```

A recommendation object should contain:

```text
hymn
score
reasons
usage_count
last_used_date
```

Keep the scoring function separately testable.

---

# 59. Query Efficiency for Usage Data

Do not perform one query per hymn to determine history.

Use PostgreSQL/Django annotations such as:

- Count
- Max

Example concept:

```text
usage_count = Count(selections)
last_used_date = Max(selections__mass__date)
```

Only finalized Masses should normally count as historical usage.

Draft Masses should not affect long-term usage history.

The current draft Mass can still apply a duplicate penalty when making recommendations for another placement in the same plan.

---

# 60. Finalized vs Draft History Rule

This rule is important:

### Finalized Mass
Counts toward hymn usage history and recommendation recency.

### Draft Mass
Does not count toward historical usage statistics.

This prevents incomplete future plans from making hymns appear recently used.

---

# 61. Category Editing Semantics

If a category name changes, historical Mass selections remain intact because selections reference hymns and placements by relational ID.

If a Mass placement is deactivated:

- preserve it in historical data;
- do not offer it for new hymn classification or new Mass selections by default.

If a language/genre/season is deactivated:

- preserve existing relationships;
- exclude it from normal "active" selector choices;
- show it in old records where relevant.

---

# 62. Data Deletion Policy

Use protective behavior.

### Hymn with no usage
May be hard-deleted by Admin.

### Hymn with historical usage
Prefer deactivation.

### Mass draft
May be deleted by authorized users.

### Finalized Mass
Do not hard-delete from the normal UI. If deletion exists, restrict it to Admin and make it explicit.

### Category in use
Reject hard delete or require deactivation.

---

# 63. Sorting Defaults

Use sensible defaults.

### Hymn Library
Alphabetical by title.

### Mass History
Newest Mass first.

### Recommendations
Highest recommendation score first with defined tie breakers.

### Settings
Display order, then name.

---

# 64. API Serialization Style

For list responses, include enough category information to render the interface without follow-up requests.

Example hymn response:

```json
{
  "id": 17,
  "title": "Example Hymn",
  "alternate_title": null,
  "language": {
    "id": 1,
    "name": "Arabic"
  },
  "genres": [
    {"id": 2, "name": "Traditional"}
  ],
  "seasons": [
    {"id": 6, "name": "Easter"}
  ],
  "placements": [
    {"id": 8, "name": "Communion"},
    {"id": 9, "name": "Thanksgiving"}
  ],
  "tags": [],
  "is_season_neutral": false,
  "usage_count": 5,
  "last_used_date": "2026-07-12",
  "is_active": true
}
```

For write payloads, using IDs is fine:

```json
{
  "title": "Example Hymn",
  "language_id": 1,
  "genre_ids": [2],
  "season_ids": [6],
  "placement_ids": [8, 9],
  "tag_ids": []
}
```

Document the convention consistently.

---

# 65. Optimistic UI

Use optimistic updates only where they are safe and easily reversible.

Good candidates:

- reordering Mass selections;
- adding/removing a hymn in a draft Mass.

For important creates/edits, normal mutation feedback is acceptable.

Never pretend data was saved if the backend rejected it.

---

# 66. Notification Strategy

Use toast notifications sparingly.

Good use:

- Hymn created
- Hymn updated
- Mass finalized
- Error saving

Do not show a toast for every autosave event.

---

# 67. Search and Filtering Acceptance Examples

These must work correctly.

### Example A

User chooses:

```text
Season: Easter
Placement: Communion
```

Result:

All active hymns that are classified for Communion and either suitable for Easter or season-neutral, depending on the filter semantics chosen.

For the normal Library filter, if `Season = Easter` is selected, return specifically Easter-classified hymns. Include season-neutral hymns only if the UI offers an explicit "Include season-neutral" behavior or clearly documents it.

For recommendations, season-neutral hymns are always legitimate candidates.

Keep Library filtering and recommendation behavior intentionally separate.

### Example B

```text
Placement: Communion
Genre: Traditional
Language: Arabic
```

All dimensions must match.

### Example C

```text
Search: mary
Placement: Closing
```

Search and placement filters both apply.

---

# 68. Library vs Recommendation Semantics

This distinction is important.

## Hymn Library
Literal filter tool.

If the user selects `Season = Easter`, show hymns explicitly assigned to Easter unless the UI also enables a season-neutral option.

## Recommendations
Pastoral suggestion tool.

For an Easter Communion slot, both:

- Easter Communion hymns;
- season-neutral Communion hymns

may be recommended.

This avoids surprising filter behavior while keeping recommendations useful.

---

# 69. Suggested UI Component Inventory

Build reusable components such as:

```text
AppShell
Sidebar
PageHeader
SearchInput
FilterBar
MultiSelect
CategoryChip
EmptyState
ErrorState
LoadingSkeleton
ConfirmDialog
HymnCard
HymnTable
HymnForm
UsageBadge
RecentUseWarning
MassPlacementSection
SelectedHymnRow
HymnPickerDrawer
RecommendationCard
MassStatusBadge
CategoryManager
```

Do not build one enormous component per page.

---

# 70. State Boundaries

Server data:

- hymns;
- categories;
- Masses;
- recommendations;
- history.

Use TanStack Query.

Local UI state:

- currently open modal;
- filter drawer expanded;
- local search input before debounce;
- temporary drag state.

Do not duplicate entire server resources into global state.

---

# 71. Error Logging

For development:

- useful backend logging;
- full traceback in debug only.

For production:

- no secret leakage;
- structured server errors where practical.

External error monitoring is optional.

---

# 72. Security Baseline

Implement normal Django production protections.

Requirements:

- CSRF protection;
- secure password hashing through Django;
- authentication required for application data;
- permission checks on write endpoints;
- server-side validation;
- no raw SQL from user input;
- environment-based secrets;
- production debug off;
- secure cookies in production.

Do not expose Django admin publicly without authentication.

Using Django admin internally for debugging is acceptable, but it is not a replacement for the application's Settings UI.

---

# 73. Django Admin

Configure Django admin for key models.

Useful admin features:

- search hymn title;
- filters for language/active;
- Mass date/status filters;
- category ordering.

This is for internal administration and debugging.

The user-facing application must still implement the required React screens.

---

# 74. Migrations

Generate normal Django migrations.

Do not rely on automatic schema creation at runtime.

The project must start cleanly from an empty PostgreSQL database with:

```bash
python manage.py migrate
python manage.py seed_initial_data
```

---

# 75. Implementation Phases

Implement in this order.

## Phase 1 — Project foundation

- monorepo structure;
- Django;
- PostgreSQL;
- React + TypeScript;
- authentication;
- API plumbing;
- lint/test tooling.

## Phase 2 — Hymn domain

- classification models;
- Hymn model;
- migrations;
- seed command;
- CRUD API;
- hymn library frontend;
- add/edit hymn.

## Phase 3 — Mass planning

- Mass;
- MassHymnSelection;
- Mass CRUD;
- planner UI;
- autosave;
- finalization.

## Phase 4 — Usage history

- usage annotations;
- hymn usage page;
- Mass history;
- dashboard recent usage.

## Phase 5 — Recommendations

- recommendation service;
- API;
- recommendation UI;
- recent-use warnings.

## Phase 6 — Settings

- full category management;
- safe deactivation/deletion;
- ordering.

## Phase 7 — Polish

- responsive behavior;
- accessibility;
- print view;
- error/empty/loading states;
- test completion;
- documentation.

Do not start with optional future features.

---

# 76. Codex Execution Rules

When implementing this specification:

1. Inspect the repository before changing files.
2. Preserve working code unless there is a good reason to refactor it.
3. Prefer small, coherent modules.
4. Do not create placeholder functions for core functionality.
5. Do not leave TODOs for requirements that belong to the current phase.
6. Run migrations.
7. Run backend tests.
8. Run frontend tests.
9. Run linting.
10. Fix failures before declaring the work complete.
11. Keep the README synchronized with actual commands.
12. When a specification detail is ambiguous, choose the simplest solution that preserves the product principles in this document.
13. Do not silently omit a requested feature because it is inconvenient.
14. If a feature truly cannot be completed, document exactly what remains and why.

---

# 77. Definition of Done for Version 1

Version 1 is considered complete when all of the following are true.

## Authentication
- User can log in and log out.
- Unauthenticated users cannot access application data.

## Hymn library
- User can add a hymn.
- User can edit a hymn.
- User can deactivate a hymn.
- User can search hymns.
- User can combine filters.
- Usage count and last-used date are visible.

## Categories
- Genres manageable.
- Seasons manageable.
- Placements manageable.
- Languages manageable.
- Tags manageable.
- Category values are not hard-coded into normal application logic.

## Mass planning
- User can create a Mass.
- User can assign a season.
- User can add multiple hymns across placements.
- User can reorder hymns.
- User can remove hymns.
- Draft data is saved.
- User can finalize a Mass.
- Finalized Mass contributes to hymn usage history.

## Recommendations
- Placement suitability affects suggestions.
- Season suitability affects suggestions.
- Recent usage affects ranking.
- Never-used hymns can surface.
- Explanations are visible.
- User can override suggestions and select any suitable hymn manually.

## History
- Previous Masses are visible.
- Hymn usage history is visible.
- Draft Masses do not count as historical usage.

## UI
- Works on desktop and mobile.
- Has clear loading/empty/error states.
- Basic accessibility requirements are met.

## Quality
- Backend tests pass.
- Frontend tests pass.
- Linting passes.
- README is complete.
- Fresh database setup works.

---

# 78. Example User Journey

Use this scenario as a functional acceptance test.

An administrator first seeds the application.

They add a hymn:

```text
Title: Example Hymn
Language: Arabic
Genre: Traditional
Season: Easter
Placement:
- Communion
- Thanksgiving
```

The hymn has never been used.

Next they create:

```text
Sunday Mass — April 12
Season: Easter
```

In the Communion section they press:

`Add hymn`

The recommendation drawer appears.

`Example Hymn` is near the top because:

- it matches Communion;
- it matches Easter;
- it has never been used.

They select it and finalize the Mass.

The hymn now shows:

```text
Times used: 1
Last used: Apr 12
```

The following Sunday they create another Easter Mass.

When opening Communion recommendations, the same hymn is still available but ranked lower because it was used recently.

Another Easter Communion hymn that has not been used in months should rank above it.

The planner may still intentionally choose the recently used hymn.

That behavior represents the central product value.

---

# 79. Final Product Character

The finished application should feel like a focused internal tool made specifically for a church music coordinator.

It should not feel like:

- a generic CMS;
- a spreadsheet copied into a browser;
- an analytics dashboard;
- a static hymn catalog.

Its central purpose is:

> **Help the team quickly choose appropriate hymns for the right moment of the Mass, while remembering what has already been sung recently.**

Keep every major technical and UX decision aligned with that goal.
