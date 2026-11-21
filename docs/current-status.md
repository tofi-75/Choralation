# Current project status

Reviewed on November 20, 2026 against repository commit `91a8c56`, the running local app, and Render’s service and deployment records.

## Release and evidence

Choralation is live at [choralation.onrender.com](https://choralation.onrender.com). Render serves commit `91a8c566094383eb21a2e69ad2878dcf75601c54`, deployed November 15. [GitHub Actions run 43712740786](https://github.com/tofi-75/Choralation/actions/runs/43712740786) passed both application checks and the production image/PDF persistence job. The release included 119 passing frontend unit tests. The November 20 documentation review adds no new feature release.

Render uses the existing Free web service in Frankfurt. Automatic deployment is off. The Blueprint proposes deployment after CI checks pass, but it has not synchronized that setting to this manually operated service. The live service’s configured HTTP health-check path is empty. Public `/health/ready/` responds with database readiness, and should be checked after deployment. Setting that path in Render and verifying automatic deployment are still pending operational work.

Production requires private S3 storage and verifies write/read/cleanup before startup. CI verifies PDF persistence across fresh application containers. Prior hosted persistence acceptance is recorded in the dated reports. The November 20 review checked service state and public readiness without changing hosted records or downloading private PDFs. A current database backup and a separate PDF bucket backup are required before another authorized release.

## Local changes awaiting release

The November 21 checkout implements independent Admin/Choirmaster/User accounts and Leader/Planner/Member choir assignments, phone PDF width fit, saved-row Focus/hold navigation, placement prefill and lossless PDF gzip storage. [Behavior, permissions and staged rollout](roles-reader-pdf-update.md) document the changes. They are local, with additive migrations and compressed writes disabled by default. Hosted files have not been converted. The live release below remains unchanged.

Local database/media backup and migration preservation checks passed. Verification passed 452 backend tests, 127 frontend unit tests, 21 affected desktop/phone-width browser cases, production frontend build, types/lint/format, schema and documentation checks. Physical phones and the updated Linux S3/container harness remain release acceptance work.

## Live behavior at 91a8c56

- New accounts start as regular users. Simple-account mode enables registration and disables verification and emailed recovery. Existing password login remains available. API roles remain Admin, Planner, and Viewer.
- Settings contains Account, default choir preference, Admin classification managers, and the Admin-only Manager requests queue. Manager approval grants choir creation. Choir membership still determines planning access to each choir. Creating a choir makes its creator a Planner of that choir.
- Members can create private hymns and submit them to their choir’s planners for publication. Shared hymns and protected PDF access follow publication and membership rules.
- Draft Masses open in edit mode and autosave. Save Mass waits for saved changes and finalizes the program. Finalized programs open read-only. Planner/Admin Edit confirms reopening as a draft. Usage counts derive only from finalized selections within the selected choir.
- A missing-hymn search can lead from a draft section to hymn creation and back. The new hymn is inserted automatically when suitable, or only after warning confirmation. The current create action appears after the shared-library search confirms no match.
- Navigation shows Home, Hymns, Mass plans, Mass History, and Choirs, with Settings below. The profile menu opens Account settings or signs out. Notices and confirmations use centered dialogs. Notifications close with their backdrop, close icon, or Escape.
- Saved Mass hymn rows are clickable across their contents and hymn details provide Back to Mass. Language, key, tempo, and voices appear in the saved program. Missing key/tempo use `—`, single voice uses `1`, and unspecified polyphonic voices use `-`.
- Mass Focus uses a compact title/metadata/close header and previous/next hymn footer. All header titles share the same responsive font rule and truncate to one line with a direction-aware ellipsis. Focus entry puts keyboard focus on the dialog, leaving the title selector available by Tab.
- Short vertical swipes turn PDF pages in Focus and PDF fullscreen, or lyric pages in Focus. Oversized PDFs pan until an edge, then a fresh swipe turns the page. A long downward swipe from the top of any page closes the active reader. Lyrics reflow for viewport and font-size changes and retain their passage within the session.
- Reloading the same Mass browser-history entry restores Focus in that tab, starting at the first hymn. An explicit exit clears that restoration. This uses optional session storage. Native fullscreen requires a new interaction after reload. PDF and lyric reading positions are retained within a mounted Focus session.
- The eight default season groups are Advent & Christmas, Epiphany, Lent, Passion, Resurrection, Pentecost, Holy Cross, and Ordinary Time. Ordinary Time also marks any-season suitability. Choir calendar defaults, timezone, and exact-date overrides are available.
- The current seed command declares 39 defaults across the five classifications. Migrations can retain inactive former categories and custom rows, so an existing database can contain more records.

## Pending work

- Fix the desktop sidebar and compact hymn-library cards on phones.
- Show the missing-hymn creation action immediately alongside Search all placements.
- Improve same-language and cross-language search.
- Measure storage and hymn/PDF loading against the target below one second; lossless gzip storage is implemented locally with staged rollout pending.
- Record physical iPhone Safari and Android Chrome acceptance, coordinator rehearsal, screen-reader review, and Firefox coverage. Emulated viewports do not complete these checks.
- Recommendations, Practice, complete Arabic UI/language settings, print/release polish, larger-library performance measurement, and parish hierarchy remain future work. Choir membership and collaborative revision-guarded planning are already implemented.

## Running locally

From this checkout, run `.\dev.cmd db-start`, then run `.\dev.cmd backend` and `.\dev.cmd frontend` in separate terminals. Open [the local app](http://127.0.0.1:5173/). Django uses `127.0.0.1:8000`, PostgreSQL `127.0.0.1:55432`, and the frontend proxies requests to Django. The November 20 session started these services. Django system checks and migration checks passed. A Chrome smoke check verified the sign-in page, proxied readiness, simple-account flags, anonymous API protection, and absence of page errors. The documentation verifier passed 262 local links and source-fixture checks; section anchors and Git whitespace checks passed.

For phone access, use [Phone testing](phone-testing.md). The owner’s instruction to keep Windows firewall settings unchanged remains in effect. The work PC’s earlier phone requests timed out at the network boundary. A successful same-PC request does not establish phone connectivity.

## Documentation authority

Use this page, [README](../README.md), [API contract](api.md), [Accounts and choirs](accounts-and-choirs.md), and [Backlog](backlog.md) for current behavior. The original specification and imported chat archive preserve source material. Dated milestone and incident reports retain their original evidence and are labelled historical. Test counts and old local-service claims in those reports describe the recorded session.

[Conversation handoff](chat-handoff.md) contains the condensed context for continuing work. Commit, push, deployment, provider changes, and hosted data changes require the owner’s authorization for the next release.
