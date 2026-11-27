-- Run only in the NEW backup project, using dedicated confirmed Auth users:
-- psql -v writer_uid=<uuid> -v reader_uid=<uuid> -v pruner_uid=<uuid> -f this-file.sql
BEGIN;
CREATE POLICY choralation_backup_objects_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'choralation-backups' AND auth.uid() IN
    (:'writer_uid'::uuid, :'reader_uid'::uuid, :'pruner_uid'::uuid));
CREATE POLICY choralation_backup_bucket_read ON storage.buckets FOR SELECT TO authenticated
  USING (id = 'choralation-backups' AND auth.uid() IN
    (:'writer_uid'::uuid, :'reader_uid'::uuid, :'pruner_uid'::uuid));
CREATE POLICY choralation_backup_objects_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'choralation-backups' AND auth.uid() = :'writer_uid'::uuid);
CREATE POLICY choralation_backup_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'choralation-backups' AND auth.uid() = :'pruner_uid'::uuid);
COMMIT;
-- No UPDATE policy. Writer cannot overwrite or delete; reader cannot mutate;
-- pruner cannot insert or rewrite. Keep this project free of broader policies.
