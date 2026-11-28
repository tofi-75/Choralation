-- Read-only metadata: run in the Supabase project being audited.
-- No user records, object names, credentials or PDF contents are selected.
SELECT p.tablename, p.policyname, p.roles, p.cmd, p.permissive,
       p.qual AS using_expression, p.with_check AS check_expression,
       c.relrowsecurity AS rls_enabled,
       r.rolsuper AS authenticated_superuser,
       r.rolbypassrls AS authenticated_bypass_rls,
       pg_has_role('authenticated'::name, c.relowner, 'MEMBER')
         AS authenticated_is_table_owner
FROM pg_policies AS p
JOIN pg_namespace AS n ON n.nspname = p.schemaname
JOIN pg_class AS c ON c.relnamespace = n.oid AND c.relname = p.tablename
CROSS JOIN pg_roles AS r
WHERE p.schemaname = 'storage'
  AND p.tablename IN ('objects', 'buckets')
  AND r.rolname = 'authenticated'
ORDER BY p.tablename, p.policyname;
