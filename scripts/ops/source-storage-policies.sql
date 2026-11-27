-- psql -v source_reader_uid=<dedicated Supabase Auth user's UUID> -f this-file.sql
-- Owner reviews existing policies first: permissive policies combine with OR.
BEGIN;
CREATE POLICY choralation_backup_source_objects_read ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'sheet-music' AND auth.uid() = :'source_reader_uid'::uuid);
CREATE POLICY choralation_backup_source_bucket_read ON storage.buckets FOR SELECT
  TO authenticated USING (id = 'sheet-music' AND auth.uid() = :'source_reader_uid'::uuid);
COMMIT;
-- Intentionally no INSERT, UPDATE or DELETE policy for this identity.
