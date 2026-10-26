# Durable PDF storage: owner setup and release checklist

The PDF repair keeps the existing Render compute plan, Supabase project, PostgreSQL records, and private download APIs. No schema migration or email setup is required. Uploads must use Supabase Storage; production no longer accepts temporary local files.

## 1. Preserve files before changing the service

Download every currently readable PDF and keep original copies on your computer. A Render deployment or instance replacement can discard the existing local copies. The owner confirmed on 26 October 2026 that PDF copies and originals are secured.

Keep a current database backup too. The existing hidden-password helper is `scripts/backup-hosted.py`; run it in an interactive project terminal if a new export is needed. Do not paste its password or database URL into chat. A database export does not contain the actual PDFs. Export any existing Supabase Storage objects separately before a recovery/import operation.

## 2. Find the six Render values

In the same Supabase project used by Choralation:

1. Open **Storage → Buckets**. Confirm a bucket named `sheet-music` exists. If absent, create it and leave **Public bucket off**. Keep it private. The app accepts PDFs up to 10 MB; any bucket size limit must allow that amount. If you restrict MIME types, allow `application/pdf`.
2. Open **Storage → Settings → S3 configuration**. The official [S3 authentication guide](https://supabase.com/docs/guides/storage/s3/authentication) links to the configuration screen if the dashboard navigation differs.
3. Copy the displayed **Endpoint** and **Region**. Use the exact endpoint, including `/storage/v1/s3`; prefer the displayed direct storage hostname. Do not append the bucket name to the endpoint.
4. In **S3 Access Keys**, use an existing pair whose secret you have retained. If its secret is unavailable, generate a new pair named `Choralation Render`. Keep the new secret privately; do not revoke other keys until the cutover is verified.
5. Open **Render → Choralation → Environment**. Add or update only these keys:

| Render key | Where the value comes from |
| --- | --- |
| `DJANGO_STORAGE_BACKEND` | Literal `s3` |
| `AWS_STORAGE_BUCKET_NAME` | Literal `sheet-music` |
| `AWS_S3_ENDPOINT_URL` | Supabase's S3 Endpoint, e.g. `https://PROJECT_REF.storage.supabase.co/storage/v1/s3` |
| `AWS_S3_REGION_NAME` | Region displayed on that S3 configuration screen |
| `AWS_ACCESS_KEY_ID` | S3 Access Key ID |
| `AWS_SECRET_ACCESS_KEY` | Matching S3 Secret Access Key |

The S3 keys are server credentials, distinct from the database password, publishable/anon key, service-role key, and Google credentials. Copy them directly into Render, not chat, Git, screenshots, or frontend settings. Leave database, email, billing, compute, and automatic-deployment values unchanged.

Choose **Save only** while CI is running. This preserves the current running instance until the tested cutover. A saved value is not active until a deployment uses it. Tell the implementation task that all six values are prepared; share only missing setting names if assistance is needed.

## 3. Engineering release gates

The production image requires durable storage. Missing/local storage settings are rejected in Render and in the image runtime. The Docker build uses an inline collectstatic-only local exception; it is not retained as a runtime exception.

Before migrations or Gunicorn startup, `python manage.py check_storage` verifies the actual S3 backend using a unique temporary PDF: write, read back, compare bytes, and delete only that canary. A failed operation stops startup with a sanitized error. This confirms the active credentials/target support the operations the app needs. Keep the bucket private in Supabase; the S3 protocol does not supply a portable bucket-publicity check.

CI uses a pinned TLS S3 emulator with certificate validation enabled, an isolated PostgreSQL database, and three independently created app containers. It uploads in A, removes A, reads/replaces in fresh B, removes B, and reads/deletes in fresh C. No application media volume is shared; local filesystem fallback cannot satisfy the test. It also checks private access and preserves file references/bytes across replacements. Regular application, browser, schema and production serving checks must pass before deployment.

## 4. Verify the cutover before restoring originals

1. Deploy the exact passing commit. Do not synchronize the whole Blueprint: its compute/automatic-deployment settings are outside this repair.
2. Check Render logs for **Private S3 storage verified: write, readback and cleanup passed.** A storage-check failure keeps the deployment from serving traffic; fix only the indicated S3 configuration and retry. Do not select local storage to bypass it.
3. Sign in as Admin and open `/api/v1/hymns/attachment-audit/` on the same site. It returns a small paginated report including unpublished hymns. `storage_backend` must be `s3`. Statuses are `present`, `missing`, or `inaccessible`. `inaccessible` means a provider/permission/network failure and must not be treated as proof an object was deleted. Follow the `next` link for more rows. Other roles cannot read the report. It does not expose keys, URLs, credentials, or PDF content, and does not modify attachments.
4. Create one fictional private test hymn and upload a small PDF through the app. Confirm it is downloaded successfully and exists in the Supabase bucket. Keep this fixture until persistence is tested.
5. Replace/redeploy the app instance using that same tested commit. Download the retained PDF afterward and compare its bytes/hash; verify its hymn metadata/reference is unchanged. A second browser session alone is insufficient. The release task can run this acceptance with a run-owned fictional fixture and clean it afterward.
6. If testing idle sleep separately, allow the Free instance to sleep, wake it and repeat the download. No compute upgrade is needed for S3 persistence.

If preflight passes but an original attachment is missing, the old bytes may have existed only on the discarded local instance. A successful cutover cannot recreate them from a database reference.

## 5. Restore missing originals

For each missing hymn, use **Edit hymn → Sheet music PDF**, select the secured original, inspect the preview, then **Save hymn**. Reopen the saved PDF. Keep the original hymn record instead of creating a duplicate. Its Mass selections, classification and usage remain intact; replacing a PDF changes only the attachment and normal edit metadata.

If a private submission is pending, editing withdraws it under the existing moderation rules; its owner must request planner approval again after saving.

For a bulk recovery, first inventory database keys and bucket objects. Copy only verified matching files, preserve existing valid objects, compare bytes before committing a changed reference, and never bulk-delete or overwrite unrelated objects. A database rollback cannot recover lost file bytes and can discard newer account/Mass data.

After recovery, repeat the audit and confirm the originals remain readable after another instance replacement. Keep separate private backups of database records and PDF objects.

## Troubleshooting

- **Hosted PDF uploads require ... s3:** the selector is missing/local. Set it to `s3`; do not disable the durable-storage requirement.
- **Supply all required private S3 settings:** one of the five AWS settings is missing/empty.
- **Private PDF storage write/read check failed:** verify project endpoint, bucket, region and the matching S3 key pair. Inspect Supabase's own logs privately if necessary; do not post credential-bearing errors.
- **Storage preflight cleanup failed:** the S3 identity cannot delete its canary, or the provider is unavailable. Resolve that before deployment.
- **503 storage_unavailable:** retry after the storage configuration/provider recovers. The app never falls back to Render's filesystem.
- **404 for an attached PDF:** audit the record. A genuinely missing object needs recovery from its original/file backup; unauthorized records remain inaccessible.

Sources: [Supabase S3 authentication](https://supabase.com/docs/guides/storage/s3/authentication), [Render environment save options](https://render.com/docs/configure-environment-variables), [Render ephemeral filesystems](https://render.com/docs/disks), [database backups exclude Storage objects](https://supabase.com/docs/guides/platform/backups).
