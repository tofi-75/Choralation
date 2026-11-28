-- Read-only, phone-friendly scope checks for the reviewed backup project.
-- No records, object names, credentials or PDF contents are selected.
WITH identities(writer, reader, pruner) AS (
  VALUES (
    '9cc4eaa6-7c41-4762-9732-759d245a3d31',
    '44fe3b8f-4b64-4d7d-92fd-470bf198e321',
    'f1520d8b-115f-49af-8ef1-0301532d30cc'
  )
), rules(name, tbl, operation, condition, is_insert) AS (
  SELECT 'choralation_backup_bucket_read', 'buckets', 'SELECT',
    format('((id = %L::text) AND (auth.uid() = ANY (ARRAY[%L::uuid, %L::uuid, %L::uuid])))',
      'choralation-backups', writer, reader, pruner), false
  FROM identities
  UNION ALL
  SELECT 'choralation_backup_objects_read', 'objects', 'SELECT',
    format('((bucket_id = %L::text) AND (auth.uid() = ANY (ARRAY[%L::uuid, %L::uuid, %L::uuid])))',
      'choralation-backups', writer, reader, pruner), false
  FROM identities
  UNION ALL
  SELECT 'choralation_backup_objects_insert', 'objects', 'INSERT',
    format('((bucket_id = %L::text) AND (auth.uid() = %L::uuid))',
      'choralation-backups', writer), true
  FROM identities
  UNION ALL
  SELECT 'choralation_backup_objects_delete', 'objects', 'DELETE',
    format('((bucket_id = %L::text) AND (auth.uid() = %L::uuid))',
      'choralation-backups', pruner), false
  FROM identities
), actual AS (
  SELECT * FROM pg_policies
  WHERE schemaname = 'storage' AND tablename IN ('objects', 'buckets')
)
SELECT 'exact_policy_scope' AS test,
  count(*) = 4 AND bool_and(coalesce(
    a.tablename = e.tbl AND a.cmd = e.operation
    AND a.roles = ARRAY['authenticated']::name[]
    AND a.permissive = 'PERMISSIVE'
    AND (
      a.qual IS NOT DISTINCT FROM CASE WHEN e.is_insert THEN NULL ELSE e.condition END
      OR a.qual IS NOT DISTINCT FROM CASE WHEN e.is_insert THEN NULL
        ELSE replace(e.condition, 'auth.uid()', '( SELECT auth.uid() AS uid)') END
    )
    AND (
      a.with_check IS NOT DISTINCT FROM CASE WHEN e.is_insert THEN e.condition ELSE NULL END
      OR a.with_check IS NOT DISTINCT FROM CASE WHEN e.is_insert
        THEN replace(e.condition, 'auth.uid()', '( SELECT auth.uid() AS uid)') ELSE NULL END
    ),
    false)) AS passed
FROM actual a FULL JOIN rules e ON e.name = a.policyname
UNION ALL
SELECT 'rls_no_bypass', count(*) = 2 AND bool_and(
  c.relrowsecurity AND NOT r.rolsuper AND NOT r.rolbypassrls
  AND NOT pg_has_role('authenticated'::name, c.relowner, 'MEMBER'))
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
CROSS JOIN pg_roles r
WHERE n.nspname = 'storage' AND c.relname IN ('objects', 'buckets')
  AND r.rolname = 'authenticated';
