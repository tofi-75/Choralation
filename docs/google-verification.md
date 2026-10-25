# Gmail and Google verification readiness

**October 25 release:** [Simple accounts and owner-assisted recovery](simple-accounts-release.md) supersedes earlier registration/verification activation instructions. Gmail is retained for future use; both email features remain explicitly disabled. No Google submission or billing change is part of this release.

Prepared 24 October 2026. Operator: **Toufic Lattouf, Lebanon**. Contact and authorized sending account: **tofi.lattouf@gmail.com**.

## What is and is not ready

Engineering checks and actual delivery acceptance are separate. Google has not approved this application. No automatic submission, publishing change, domain purchase, commit, push or deployment is part of this work.

Proposed public URLs, available after the owner deploys this code:

- Homepage: https://choralation.onrender.com/about
- Privacy: https://choralation.onrender.com/privacy
- Terms: https://choralation.onrender.com/terms

These are real server-rendered pages. They do not depend on JavaScript, sign-in, the database, or the identity API. The normal application landing behavior is preserved. Public pages contain no tracking scripts or external fonts. Their CSP blocks scripts, embedded objects and framing.

**Submission prerequisite:** Google currently specifies DNS-level Domain Property verification, not URL-prefix/site verification. Standard Render subdomains do not give the application owner management of Renderâ€™s DNS zone. Keep this hostname as requested, but record eligibility as unresolved until Google explicitly accepts it or the owner supplies an eligible verified domain. An HTML verification tag is not evidence of meeting this requirement. Do not put onrender.com into Authorized domains and claim ownership of it. See [Google domain verification](https://support.google.com/cloud/answer/13804266) and [production policy](https://developers.google.com/identity/protocols/oauth2/production-readiness/policy-compliance).

## Exact scope and justification

Request only `https://www.googleapis.com/auth/gmail.send`. It is a sensitive scope, not a request to read Gmail or a restricted mailbox scope. Do not add `mail.google.com`, Gmail read/modify/compose, contacts, profile or calendar scopes.

Suggested reviewer explanation:

> Choralation is a choir and church music planning application. Its operator authorizes a dedicated Gmail sending account once. The backend uses gmail.send to deliver user-requested email-verification and password-recovery links. Ordinary application users register with an email address and password and do not connect Google accounts. The service does not read inboxes, contacts or existing messages. Messages contain only the requested account action and its single-use link. A narrower Google scope does not provide ordinary transactional email sending.

Approval of this explanation and this use case is Google's decision. The owner-only authorization may qualify for a verification exception, but this document does not declare an exemption or use it as a substitute for formal acceptance.

## Data flow and confidentiality

1. The owner grants send-only consent through a Desktop OAuth client using localhost, state validation and PKCE. Credentials stay in ignored `.local` during setup and in Render secrets when hosted.
2. The backend uses the refresh token over verified HTTPS with no redirects. Access tokens exist only in process memory.
3. The account service stores a random link token as a hash, bound to the account, purpose, email and expiration. Only the outbound message contains the raw link.
4. Google receives the recipient, subject, message and action link; the recipient's provider receives the delivered email. Gmail may retain a Sent copy. Choralation cannot remove mailbox copies with send-only access.
5. The browser receives the token in a URL fragment, removes it from the address bar and submits a CSRF-protected verification POST automatically. A valid verification link verifies the email and signs its owner in, then opens Home without an additional password sign-in. An already signed-in different account must explicitly sign out before switching. HTTP GET alone never consumes a token. Treat the verification link as a sign-in credential; a JavaScript-capable link scanner can trigger the same client flow.
6. Logs/reports must not contain credentials, raw tokens, message bodies or private choir data. API responses use no-store caching and vary by Cookie. Secrets are excluded from Git and Docker contexts.

The shared hymn library is available to verified users. Choir records are membership-scoped; Admins have platform oversight. This is not end-to-end encryption. Do not describe every PDF as private from other verified users.

**Accepted limitation:** password-reset sending remains synchronous to preserve the free hosting setup. Generic response wording and persistent rate limits do not eliminate timing-based account inference. Do not claim constant-time responses.

No automatic retries are made for a provider timeout or uncertain send result. A request may have reached Google even when an acknowledgement was lost. Existing valid links survive failed replacement sends. A missing/revoked token, quota error or outage keeps accounts unverified and permits rate-limited recovery/resend.

## Owner checklist before submission

- Resolve the DNS/domain eligibility prerequisite with Google. Do not submit placeholder URLs or claim unverified ownership.
- Review the public privacy/terms text, operator name, contact email and actual provider configuration.
- Back up the hosted database and bucket separately; deploy the reviewed code with registration and mandatory legacy verification disabled.
- Configure accurate branding, support/developer contacts, the public URLs above and only gmail.send in Google Auth Platform. Keep development/testing and production projects appropriately separated.
- Decide publishing status with Google's current requirements. Testing Gmail refresh tokens expire after seven days. After moving the intended project to In Production, perform fresh owner consent and privately replace Render credentials.
- Complete actual hosted verification and reset tests before enabling either account flag. Confirm the Admin recovery procedure is available.
- Keep the OAuth client ID visible where Google requests it in evidence; hide client secrets, refresh/access tokens, real action links, unrelated mailbox contents and personal user records.
- Publish only the reviewed pages and evidence, then follow Google Branding/Verification Center instructions. Provider logins, video upload, publishing and submission remain owner actions.

## Demonstration video script

Use English, fictional application data and the authorized operator's sending account. Prepare an unlisted demonstration video only after the domain and public pages are accepted for review.

1. Show the public About, Privacy and Terms pages and their matching application branding/URLs.
2. Show that only gmail.send is requested. Demonstrate the Desktop authorization and consent screen showing Choralation and its OAuth client ID. Do not expose credential files or token exchange output.
3. Register a fictional test account with an operator-controlled inbox. Explain that this account does not grant Google access.
4. Show arrival of its verification email without revealing the link token in the recording. Open it while signed out and demonstrate automatic email verification, sign-in and Home. Explain single use, expiry and the refusal to silently switch a different signed-in account.
5. Request recovery, show the recovery email and demonstrate setting a new password and invalidation of an older session. Do not record passwords or token-bearing address bars.
6. Explain that the integration sends messages only, and show the privacy contact and deletion-request process.

## Privacy requests and deletion runbook

The contact is tofi.lattouf@gmail.com, with a 30-day response target. This is an owner-assisted process, not an automatic self-service deletion feature.

1. Record the request privately with minimal information and verify ownership through the account's established email or an independently confirmed channel. Never ask for passwords, action tokens or unnecessary identity documents.
2. Explain which information is held, who can access it, and whether shared records or backup/mailbox copies need separate handling. For access requests, include only the requester's own data; do not disclose other choir members' emails or private programs they cannot access.
3. For deletion, check every choir membership. Arrange a replacement for each last planner before removing them. Keep an active platform Admin. Do not use bulk User deletion to bypass these checks.
4. Deactivate the account first, invalidate outstanding account tokens and remove its active sessions. Check that sign-in and API access are rejected. Do not erase data before ownership and the exact scope are confirmed.
5. Through owner-controlled Django administration/maintenance, remove the User and its cascading account profile, tokens, memberships and join requests. Hymn and Mass attribution uses SET_NULL and shared records stay intact. Review free-text notes/content for unnecessary personal references; do not delete other members' records as part of an account request.
6. Review support logs, local exports and backups. Minimize/remove account identifiers where operationally possible. Document retained records and actual retention limits. Do not promise immediate erasure from provider backups or email mailboxes.
7. Run the existing security cleanup regularly: `python backend/manage.py cleanup_account_security`. It removes expired tokens and rate buckets older than the existing seven-day retention window; no scheduled worker has been added. Remove expired Django sessions through `clearsessions` as part of maintenance.
8. Reply to the requester with what was completed and what remains, without emailing sensitive exports or disclosing other users' data.

## Local and hosted acceptance

Mocked transport tests cover malformed configuration, invalid/revoked credentials, 401/403/429/5xx, redirects, TLS/network failures, malformed/oversized responses, minimum scope, partial batches and silent failures. Account/browser tests cover link ownership, expiry, reuse, retries, CSRF, session invalidation, private data boundaries and public pages without JavaScript.

The live local test uses a disposable database and exactly two authorized initial sends to tofi.lattouf@gmail.com. It is intentionally interactive so inbox receipt and real link use can be confirmed by the owner. No inbox-reading permission is requested. A successful Gmail response alone is not inbox-delivery acceptance. Additional sends require explicit authorization; do not rerun the live helper automatically after failure.

The implemented helper is `scripts/gmail-live-check.py`. Running it without `--send-two` sends nothing. Its explicit send mode is reserved for an authorized acceptance session. The first October 24 run used one verification send and timed out. The owner authorized a fresh retry, then confirmed both retry emails arrived and verification/reset/new-password sign-in worked. The helper passed its session-invalidation checks and removed the disposable data. Both safe ledgers remain in ignored `.local`. **Do not start another run without new explicit authorization.** The helper reads the existing ignored `.local/gmail-hosted-settings.json` into process-only settings, refuses a non-local database, and creates an isolated database and local site at `http://127.0.0.1:8012/login`. Normal `.env` and hosted settings are unchanged.

During that session, read the temporary username/password directly from `.local/gmail-live-login.txt`; never paste them, the email bodies or the token-bearing links into reports. Open the verification email; the client verifies the link and signs in automatically. The helper then requests the reset email through the real account API. Use that link to set a new test password and sign in again. Each owner step has a 20-minute timeout. Report whether both messages arrived (including spam checks) and whether both actions worked. The helper checks the old session and password are invalid, then removes its database and login file. On timeout/failure it also removes disposable data; links to that database cease to work. Its retained `.local/gmail-live-send-ledger.json` contains only the attempt purposes and acceptance flags and prevents accidental extra sends. Do not remove that safeguard to retry without new authorization.

Record the actual results and remaining owner gates in `docs/acceptance.md`. Never mark Google verification or hosted delivery complete based only on local tests.

Sources: [Gmail scope classifications](https://developers.google.com/workspace/gmail/api/auth/scopes), [privacy requirements](https://support.google.com/cloud/answer/13806988), [domain verification](https://support.google.com/cloud/answer/13804266), [sensitive-scope review](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification), [Google API user data policy](https://developers.google.com/terms/api-services-user-data-policy), [token lifecycle](https://developers.google.com/identity/protocols/oauth2/).
