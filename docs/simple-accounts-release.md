# Simple accounts release — October 25, 2026

This release supersedes earlier instructions to require email verification. Registration creates a signed-in session and opens Home. Existing accounts awaiting verification can sign in with their previous password. Email login is case-insensitive; a password is always required. Email ownership is unverified unless previously verified: timestamps and pending flags are preserved, not fabricated.

## Configuration

Use these explicit settings locally and on the existing Render service:

```dotenv
ACCOUNT_REGISTRATION_ENABLED=true
ACCOUNT_EMAIL_VERIFICATION_ENABLED=false
ACCOUNT_PASSWORD_RESET_ENABLED=false
ACCOUNT_VERIFICATION_REQUIRED=false
```

Gmail credentials are unnecessary in this mode. The Gmail transport, authorization helper and email-enabled tests remain available for future activation. EmailJS is deferred. Verification, resend and emailed recovery endpoints return sanitized `email_unavailable` responses without sending mail or consuming links. Old links explain the disabled feature and cannot sign anyone in. Enabling registration alone must not enable either email feature.

Choir privacy, membership approval, planner permissions, password validation, CSRF and persistent abuse limits remain enforced. New users have regular access and no choir-creation permission. Shared hymns are accessible to signed-in users; private choir programs still require membership or Admin access.

## Owner-assisted password recovery

Users contact **tofi.lattouf@gmail.com**. Independently establish account ownership before changing a password; access to an unverified email address alone is insufficient. Use previously established contact or other independently corroborated account evidence. Do not request existing passwords or email tokens. Decline a request when ownership cannot be established.

For local accounts, run Django's `changepassword` command. For hosted accounts, fill the private `.env.hosted` using `.env.hosted.example`, retaining the actual hosted database, secret and storage settings, then run:

```powershell
.\.venv\Scripts\python.exe scripts/hosted-admin.py change-password --username existing-username
```

The helper identifies the Supabase target and requires the existing `HOSTED` confirmation. Django prompts for the new password without echoing it; never pass passwords in command arguments or chat. Communicate temporary credentials through an independently agreed private channel and ask the owner to change them immediately. A signed-in user can change their password using the current password; success invalidates sessions and opens Sign in.

## Backup and release gates

1. Review all pending source, migrations and tests. Exclude credentials, databases, logs, uploads and generated evidence from Git and Docker.
2. Run `.\.venv\Scripts\python.exe scripts/backup-hosted.py` in an interactive terminal. Copy the Session pooler hostname and `postgres.PROJECT_REF` username from Supabase Connect; enter the database password at the hidden prompt. The helper requires SSL, bounds connection time, exports the public application schema to ignored `.local/backups`, and checks the archive listing. It does not read or write `.env.hosted` or save the password. The administration helper separately requires complete hosted settings when used. Backup archives contain private data and must be protected.
3. Back up the hosted database before additive account/choir migrations. Verify the archive and restore it into a separate disposable local database. Preserve a private comparison of existing account credentials, Masses, selections and PDF references. The database archive does not contain bucket files; retain the private Supabase bucket separately.
4. Run backend, frontend, browser, schema, migration, lint/format and production-serving checks on isolated data. Docker build and Linux serving are checked in GitHub CI.
5. Commit the reviewed release, push `main`, and wait for checks on that exact commit to pass.
6. Merge only the four settings above into the existing Render environment. Retain other environment values, compute/billing settings, Blueprint plan and automatic-deployment setting.
7. Manually deploy the tested commit. Verify the public URL, simple registration/login, existing-account access, choir isolation and data preservation; record the deployed SHA and actual results.

Application rollback does not reverse migrations. After multiple private choirs exist, never roll back to the old shared-workspace application: recover using a choir-aware release or a forward fix. Keep the pre-migration backup private.

## Render runtime finding

The existing Choralation service reports **Free runtime compute**. Its `starter` build plan is separate. Logs show traffic at October 24, 00:34:47 Beirut time, followed by graceful shutdown at 00:49:47, consistent with Free-service idle sleeping after 15 minutes. Workspace subscriptions do not remove Free-instance limitations. The purchase itself has not been verified. No payment or compute change is included in this release. See [Render Free documentation](https://render.com/docs/free).

## Future email activation

Keep both email features disabled until the owner resolves Google/domain eligibility and completes hosted verification/recovery delivery tests. Each feature has an independent switch. Review [Google preparation](google-verification.md) and the historical delivery results before enabling it. Previously accepted local Gmail delivery is transport evidence, not Google approval or hosted acceptance. Physical-phone acceptance, Arabic translation, Practice and recommendations remain deferred.

## Supabase Data API warning

Django owns database access through its direct session-pooler connection; no frontend Supabase database API is used. In the Supabase dashboard, open **Integrations > Data API** and turn **Enable Data API** off. With it disabled, generated REST endpoints cannot expose Django tables regardless of their grants or RLS flags. An RLS warning alone does not establish that data was accessed. Verify the setting before release; do not create public-access policies for `django_migrations`, accounts or sessions. Supabase Storage S3 is a separate service. See [official Data API security](https://supabase.com/docs/guides/api/securing-your-api).
