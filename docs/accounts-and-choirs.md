# Accounts and choirs

> **Local implementation, November 21:** [Choir roles, Mass reading and lossless PDFs](roles-reader-pdf-update.md) describes the current checkout and staged rollout. These changes are not part of the live `91a8c56` release.

> Reviewed November 20, 2026. [Current project status](current-status.md) records the live release. Dated verification notes below describe their original test sessions.

Open the profile name or avatar at the top of the workspace for **Account settings** and **Sign out**. On phones, the hamburger icon opens workspace navigation.

**Current release:** [Simple accounts](simple-accounts-release.md) supersedes the historical email-activation notes below. Registration is enabled; verification and emailed recovery are disabled.

October 20, 2026. This supersedes the original shared-workspace permission model and brings choir collaboration forward from the deferred backlog. Accounts, choir membership, and Manager requests are deployed. Email activation remains future owner-controlled work. No Google sign-in is added: users can register with any email provider and a password.

## Permissions and privacy

Published hymns and their PDF files are shared by signed-in users in simple-account mode (verified users when required). Unpublished copies are restricted to their author and authorized reviewers. A choir owns its Masses, drafts, archives and usage history. Each finalized selection contributes once to **that choir's** count; repeated selections count independently, drafts never count, and reopening/deletion updates only the owning choir's derived totals. Future finalized selections remain scheduled use. There is no global usage counter. Without an active choir, the UI hides usage and disables usage filters.

Global roles are **Admin**, **Choirmaster** and **User**. New accounts are Users. Only Admins and approved Choirmasters create choirs. Approval does not grant membership or shared hymn editing. Creating a choir assigns its creator **Choir Leader**. Leaders and Planners are independent per-choir assignments; any member can be appointed by that choir's Leaders or an Admin.

Leaders manage their choir's settings, calendar, codes, memberships and join requests. Leaders and Planners create/edit/finalize/reopen that choir's Masses and review its private hymn submissions. Leaders can confirm deletion of their choir's draft/finalized Masses; Planners cannot delete Masses. Either assignment permits shared hymn editing. Global classifications and shared hymn deletion remain Admin-only. Choirmasters can join other choirs as ordinary Members. The final Leader cannot leave or be demoted/removed without a replacement. See the [full permission matrix and migration](roles-reader-pdf-update.md).

My choirs includes memberships and applications. Directory/code previews expose no roster, leader identities, emails or programs. Members see usernames in the roster. Join codes require Leader/Admin approval and never grant membership directly. Only Leaders/Admins see/share/regenerate codes. Regeneration preserves memberships and requests.

## Choirmaster requests and account settings

Regular users choose **Request Choirmaster access** in **Settings → Account**, also linked from Choirs. Status is shown there; declined applicants can reapply with one pending request at a time. Admins open **Settings → Choirmaster requests**, with a pending count and paginated oldest-first queue. Confirm Approve or Decline; approval and the permission grant commit together, and competing decisions conflict.

Manual grant/revoke controls remain in that tab. Granting resolves a pending request; revocation preserves all choir assignments. Existing creation permissions receive the Choirmaster label. Checking status or opening Choirs refreshes identity without signing out. Existing manager-request API URLs and request history are preserved.

Choose an accessible default choir in **Settings → Account**. The current tab’s active choice takes precedence. A fresh session prefers the saved default, then the first accessible choir. Account preferences grant no additional choir access. The profile name/avatar opens Account settings or Sign out.

## Local setup and migration

1. Start the local database: `.\dev.cmd db-start`.
2. Run `.\dev.cmd migrate`. The additive migration creates a private **Initial choir**, preserves all existing Masses and selections there, and adds existing users with their corresponding Member/Planner access. Passwords and PDFs are untouched. Legacy normalized email conflicts are left unresolved, never merged or verified automatically.
3. Run `.\.venv\Scripts\python.exe backend/manage.py audit_accounts`. Resolve reported duplicate identifiers manually in Django administration before opening registration. This command only reports counts, never passwords or tokens.
4. In ignored `.env`, set `ACCOUNT_REGISTRATION_ENABLED=true`, `ACCOUNT_EMAIL_VERIFICATION_ENABLED=false`, `ACCOUNT_PASSWORD_RESET_ENABLED=false`, `ACCOUNT_VERIFICATION_REQUIRED=false`, and `APP_PUBLIC_URL=http://localhost:5173`. Restart Django. Gmail credentials are unnecessary in this mode; no account email is sent.
5. Existing accounts sign in with their previous username/password or unique case-insensitive email/password. New registrations open Home immediately. Stored email-verification evidence is preserved. An Admin or assigned Choir Leader can rename Initial choir or create additional choirs. See [simple-account configuration and owner recovery](simple-accounts-release.md).

Account creation tools create new accounts without automatically adding them to a choir. A manually provisioned Choirmaster receives choir-creation permission, then creates or requests membership of a choir. App Admins retain oversight.

## Gmail setup — owner actions only

Render Free blocks ordinary SMTP ports. The provided backend uses the Gmail HTTPS API with only `gmail.send`; it does not read a mailbox. Use a dedicated Gmail sender, not an organizational shared password.

1. Sign in to Google Cloud Console yourself, create/select a project, and enable Gmail API.
2. Configure Google Auth Platform branding/audience and the send-only scope `https://www.googleapis.com/auth/gmail.send`. For initial Testing, add the sender as a test user.
3. Create an OAuth **Desktop app** client. Download its JSON to ignored `.local/gmail-client.json`.
4. Run `.\.venv\Scripts\python.exe scripts/gmail-authorize.py`. Open the displayed consent URL yourself, choose the sending account and authorize it. The helper listens only on a temporary localhost loopback port, validates state/PKCE, and writes secrets to ignored `.local/gmail-hosted-settings.json`. It never prints the refresh token. No firewall or clock change is needed.
5. Before relying on delivery, move the OAuth app to **In Production** and obtain a fresh authorization. External Testing refresh tokens for Gmail scopes expire after seven days. Follow Google's current personal-use/unverified-app requirements; only the sending account authorizes Google access, not the people registering with Choralation. A refresh token can still be revoked or invalidated; repeat authorization if needed.
6. In Render's environment settings manually add `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, and `GMAIL_REFRESH_TOKEN` from the private generated file. Set `EMAIL_BACKEND=accounts.email_backend.GmailBackend`, `DEFAULT_FROM_EMAIL=Choralation <your-sender@gmail.com>`, `APP_PUBLIC_URL=https://choralation.onrender.com`, and `ACCOUNT_EMAIL_DAILY_LIMIT=100`. The From address must match the authorized sender. Keep `ACCOUNT_EMAIL_VERIFICATION_ENABLED=false`, `ACCOUNT_PASSWORD_RESET_ENABLED=false` and `ACCOUNT_VERIFICATION_REQUIRED=false` initially. Registration may remain enabled in simple mode. Do not put secrets in GitHub, the frontend or committed YAML.
7. Configure the same settings privately in `.env.hosted` if using the existing hosted administration helper. It must retain the actual hosted database/storage configuration; never copy the local database URL.
8. Test actual hosted delivery: save an account email and send a link, inspect inbox/spam, then open the link. The client verifies the single-use link and signs in automatically before opening Home. Test while signed out as well. HTTP GET alone must not verify anything; the browser submits a CSRF-protected POST. A different signed-in account must explicitly sign out before switching.
9. After `audit_accounts`, Google/domain acceptance and successful hosted delivery, explicitly enable `ACCOUNT_EMAIL_VERIFICATION_ENABLED=true`, `ACCOUNT_PASSWORD_RESET_ENABLED=true` and `ACCOUNT_VERIFICATION_REQUIRED=true` in Render and deploy the reviewed code. Refresh existing browser tabs to load the choir-aware client. Production startup rejects activation without HTTPS Gmail configuration. Existing sessions will also require verification. Verify the Admin recovery path first.
10. Register a new regular account, verify it, test both login identifiers and password recovery, then test a public request and a private-code request with planner approval.

All provider logins, account creation, consent, Render changes and publishing are manual. Registration is shipped disabled. Provider credentials are replaceable without changing accounts or choirs. Gmail sending limits and delivery/revocation can affect registration; failures preserve accounts and verification state and expose safe retry messages rather than provider details.

Sources: [Render Free SMTP limits](https://render.com/docs/free), [Gmail sending](https://developers.google.com/workspace/gmail/api/guides/sending), [Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes), [OAuth token lifecycle](https://developers.google.com/identity/protocols/oauth2/), [Google verification exceptions](https://support.google.com/cloud/answer/13464323).

## Recovery and operations

For a local existing account, independently confirm email ownership, then run:

```powershell
.\.venv\Scripts\python.exe backend/manage.py recover_account existing-username --email owner@example.com --confirm-email-ownership
```

For hosted recovery use the extended helper's `recover-account` action with the same explicit ownership flag and ignored `.env.hosted`. It shows the hosted target and requires typing HOSTED. Recovery never changes passwords or grants roles. The email gate also protects Django admin and its existing sessions; the owner-run recovery command remains available independently of web access. Do not disable verification as a shortcut for individual account recovery.

Verification links expire after 24 hours; reset links after one hour. Resending supersedes the previous link only after successful delivery. Reset/change-password invalidates existing sessions. Tokens are hashes in PostgreSQL; email links carry tokens in URL fragments to keep them out of HTTP URL logs, and the client completes verification with a CSRF-protected POST. A verification link also acts as a single-use sign-in credential; keep it private. Never share link URLs or log request bodies. Persistent limits survive Render restarts.

Run `cleanup_account_security` periodically through the local/hosted helper to remove expired security metadata older than seven days, retaining accounts and choir records. This release adds no paid worker or scheduled service.

The app passes choir context using `X-Choir-ID` for collection and usage queries. Direct Mass URLs authorize against the object's choir. Server services recheck membership; the browser selector is not an authorization boundary. Switching choir cancels/removes private queries and keys new results by choir. Unsaved planning changes keep the existing navigation guard.

Current hosting status is recorded in [Current project status](current-status.md). The deployed release passed production image/PDF persistence CI; automatic deployment remains off. Real hosted email delivery/recovery remains pending until the owner completes the above steps; local captured-email tests do not establish delivery. Physical-phone acceptance stays M5. Arabic translation, Practice, recommendations, parish hierarchy and choir deletion remain deferred.

## Rollout and verification notes

The migration assigns legacy records to Initial choir and gives the new database column an Initial-choir default for old workers that omit it during Render’s rolling handover. New application writes still require an explicit authorized choir; the ORM does not supply an application default. Once additional private choirs exist, recover using a choir-aware version or a forward fix: deploying the earlier shared-workspace code would lose the privacy boundary even though the database remains intact. Back up the hosted database and PDF objects separately before another deployment.

Automated browser files use run-specific cache storage, never the owner’s sheet-music folder or hosted bucket. Physical-device and actual Gmail delivery acceptance remain separate manual gates.

## Engineering verification — October 20, 2026

- Complete backend suite: **267 passed**. Includes registration/verification/recovery, session invalidation, privacy and permissions, code collisions/retirement, membership races, historical migration preservation and old-worker inserts during rolling deployment. A final forged-context write regression was also checked in the focused account suite.
- Complete frontend suite: **81 passed**. Vitest uses two workers to keep jsdom checks reliable locally and in CI; default assertions and test timeouts remain intact.
- Browser suites: **23 desktop + 69 phone-width scenarios passed**, in separate isolated runs at desktop and 360/390/430 px. Includes the original planning/library/PDF/focus-mode flows and the full new registration → email confirmation → private-code request → approval → choir-specific counts → code rotation → password recovery journey. Earlier exploratory failures were fixed before these clean runs.
- Type checking, lint, formatting, migration consistency, validated OpenAPI and production frontend build passed. Production-mode serving smoke passed with all new direct routes, built assets, HTTPS proxy handling, database readiness, private API rejection and missing-route isolation. Docker is unavailable locally; container build remains part of the existing CI gate. The existing main-bundle size advisory remains for later optimization.
- The local migration compared hashes before/after and retained **1 account, 38 hymns, 7 Masses and 37 selections**, including passwords and PDF references. No hosted database or bucket was used. Test upload storage is separated under `.cache/e2e-media/`.
- Desktop and 360 px choir screenshots were visually inspected. These are automated Chromium checks, not physical-phone acceptance. Actual hosted Gmail delivery, hosted deployment, PDF persistence/redeployment and automatic-deployment activation remain owner gates.

No provider accounts were created, no Google consent was performed, no messages were sent through a live email provider, and hosted settings were not changed. Registration and mandatory legacy verification retain their disabled defaults.

## Privacy and Gmail readiness — October 24, 2026

Public server-rendered information pages and the hardened send-only Gmail transport are documented in [Google verification readiness](google-verification.md). Do not claim Google/domain approval from local tests. Existing activation flags and hosted settings remain owner-controlled. Owner-assisted privacy requests use the public contact email with a 30-day response target. Synchronous recovery delivery retains its documented timing limitation.

## October 24 account-flow revision

Local registration is now enabled in the ignored local `.env` with the previously tested Gmail sender; hosted flags remain unchanged. New accounts still need verification before accessing data, and mandatory legacy verification remains unchanged. Opening a valid verification email automatically verifies and signs in, then opens Home. Invalid/expired/reused links show a recoverable error; other signed-in accounts are not silently replaced. After password reset or signed-in password change, the client clears its session and opens sign-in with a success notice. Delivery requests are triggered by user actions; no additional live emails were sent by the automated regression checks.
