-- Run with psql as the application table owner during attended setup.
-- No passwords are embedded. Set each with psql's hidden \password prompt.
DO $$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'choralation_backup') THEN
    CREATE ROLE choralation_backup LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'choralation_operations') THEN
    CREATE ROLE choralation_operations LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'choralation_gate') THEN
    CREATE ROLE choralation_gate LOGIN;
  END IF;
END $$;
GRANT CONNECT ON DATABASE postgres TO choralation_backup, choralation_operations, choralation_gate;
GRANT USAGE ON SCHEMA public TO choralation_backup, choralation_operations, choralation_gate;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO choralation_backup;
-- pg_dump reads sequence last_value/is_called as well as table rows. SELECT
-- permits reading these values without allowing nextval/setval (USAGE/UPDATE).
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO choralation_backup;
SELECT pg_get_userbyid(relowner) AS migration_owner
FROM pg_class WHERE oid = 'public.hymns_hymn'::regclass \gset
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_owner" IN SCHEMA public
  GRANT SELECT ON TABLES TO choralation_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_owner" IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO choralation_backup;
-- Run the following after the operations migration has been installed.
-- GRANT SELECT, UPDATE ON public.common_operationsstate TO choralation_operations;
-- GRANT SELECT ON public.common_operationsstate TO choralation_gate;
-- \password choralation_backup
-- \password choralation_operations
-- \password choralation_gate
