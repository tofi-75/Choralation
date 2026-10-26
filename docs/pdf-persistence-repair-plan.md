# PDF persistence diagnosis and repair plan

Status: code safeguards, storage diagnostics and fresh-container CI coverage implemented locally. See [manual setup and acceptance](pdf-storage-setup.md). The owner has secured readable PDFs/originals. Storage settings, passing CI and retained-file acceptance are release gates; the repair is not yet declared live or complete. Payment and compute settings remain unchanged.

## Findings — 26 October 2026

- Render is serving commit `caaa68fc5f8ef516f92a3fd0081956e1de4afd36`. No newer deployment appears in the service history.
- Runtime logs show the prior application instance shutting down at 2026-10-25 23:21 UTC and a different instance starting at 2026-10-26 04:17 UTC. Missing PDF responses occurred after that replacement. A re-upload then returned successful PDF downloads; another existing attachment still returned 404.
- `backend/config/hosting.py` defaults an absent `DJANGO_STORAGE_BACKEND` to `local` and accepts explicit local storage in a hosted production process. This was reproduced in an isolated process with production and Render indicators set. S3 is selected only by an explicit `s3` setting.
- Docker sets the local media directory to `/app/media`. Render's filesystem is ephemeral without a persistent disk. Local attachment bytes can therefore disappear while PostgreSQL preserves their file references.
- The owner confirmed that `DJANGO_STORAGE_BACKEND` is missing in Render. Combined with the deployed storage-selection code and Docker media directory, this identifies the cause: uploads use FileSystemStorage under `/app/media`. `render.yaml` declaring S3 has not made that setting active on this service. The intended Supabase project, bucket, credentials and object inventory still need private verification.
- A missing-object 404 alone does not identify the backend: django-storages also translates an S3 object 404 into FileNotFoundError. The diagnosis relies on the owner-confirmed missing setting and deployed configuration behavior, rather than the HTTP status alone.
- Upload replacement deletes only the previous key after committing the new reference; hymn deletion deletes that hymn's attached key. No deployment-wide media deletion command was found in the startup path. Both operations still need coverage in the persistence tests.
- Readiness checks PostgreSQL only. Existing production PDF tests cover another client on the same storage, and the live acceptance test removed its temporary attachment before any restart. The container smoke check restarts the same Docker container and does not retain an uploaded PDF across replacement. None establishes durable hosted storage.

## 1. Preserve recoverable files before any deployment

Download currently readable PDFs through authorized accounts and preserve original copies privately. Back up the database and separately export existing Supabase Storage objects. Database backups contain references/metadata, not PDF bytes. Do not clear missing file references, change the bucket, or trigger a restart before preserving reachable material.

## 2. Confirm the active storage target

The missing selector is confirmed. Before changing it, inspect the remaining needed Render settings privately: bucket, S3 endpoint/project, region, and credential presence. After deployment confirm the effective S3 runtime class, not merely saved Dashboard values. Compare database attachment keys (including unpublished hymns) to objects in the expected private bucket. Separate missing objects, incorrect target/project, access failures, and records that are not visible to the requesting user.

If any attachment is still missing after the S3 cutover, compare its exact stored key against the confirmed project/bucket and investigate object deletion history or an incorrect target. Preserve original references until that audit is complete.

## 3. Require durable storage in the hosted runtime

Use the existing private Supabase bucket with `DJANGO_STORAGE_BACKEND=s3`; preserve all unrelated environment variables, database settings, service plan and automatic-deployment settings. Never switch to local files when S3 configuration or transport fails.

Reject hosted production startup if uploads resolve to FileSystemStorage or required S3 configuration is absent. Keep filesystem defaults for local development and explicit isolated build/test cases. Make any build-only exemption scoped to collectstatic and absent from the runtime image environment. Check the actual storage backend before accepting hosted traffic.

No schema migration is expected: the database already stores relative object keys suitable for S3.

## 4. Add safe storage diagnostics

Add a bounded deployment preflight that verifies the configured bucket using a uniquely named fictional canary: write, read back, compare bytes, then clean up that canary only. Log sanitized backend/result information without credentials, signed URLs, file contents or private hymn details. Fail the release preflight on an unusable target. Provide an Admin-only, read-only attachment audit reporting present, missing and inaccessible objects separately.

Do not write/delete objects on every public health request. Keep public diagnostics generic and storage failures retryable; no fallback to ephemeral uploads. Do not expose bucket access to the frontend or make the bucket public.

## 5. Recover existing attachments

Inventory every attachment before copying. Keep existing valid S3 objects unchanged. Copy recoverable local/original PDFs to the intended bucket, verify hashes, and preserve existing keys where safe; if a collision requires a new key, change only the matching reference after verification. Preserve filenames, ownership and publication permissions. Never overwrite an unrelated object or bulk-delete unused-looking objects.

Files already lost with a discarded server instance require an original copy or a separate file backup. Do not restore an older database over current records to recover PDF bytes. Re-upload missing originals only after the durable backend is verified.

## 6. Close the testing gap

- Production configuration: hosted missing/local backend rejected; explicit valid S3 accepted; local development/build/isolated tests remain usable.
- Transport: missing bucket, denied credentials, timeout and storage outage return sanitized errors, preserve the previous usable PDF/reference, and never write a local fallback.
- Privacy: private submissions and PDFs remain restricted; publication/choir permissions continue to apply.
- Container replacement: use an isolated S3-compatible test service and PostgreSQL. Upload through app container A; remove A; start fresh container B with an empty local filesystem against the same DB/object storage; download and compare bytes. Test replacement and repeat with another fresh app container. Restarting one container is insufficient because its writable layer can survive.
- Delete/replace failure and concurrency tests must ensure only the intended old or explicitly deleted object is removed.
- Run backend, frontend, browser, schema/migration consistency, lint/format, build and production serving gates.

## 7. Hosted acceptance

After backing up recoverable files and passing CI, deploy the reviewed fix without altering billing or compute. Verify the effective S3 target and actual canary object in Supabase. Upload a fictional PDF through the app, retain it, restart/replace the application instance, and redeploy; verify the same database reference and identical downloaded bytes after each event. Confirm private access restrictions. Remove only the run-owned acceptance records/objects after those checks.

Complete the incident only after retained PDFs survive real instance replacement and redeployment. Record the deployed commit, target confirmation and acceptance results.

## References

- Render ephemeral filesystems: https://render.com/docs/disks
- Render environment settings and when saved changes take effect: https://render.com/docs/configure-environment-variables
- Supabase S3 compatibility: https://supabase.com/docs/guides/storage/s3/compatibility
- Supabase database backups exclude Storage objects: https://supabase.com/docs/guides/platform/backups
