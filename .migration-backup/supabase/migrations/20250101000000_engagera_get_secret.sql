-- Creates a public wrapper around vault.decrypted_secrets so the Express API
-- server (using the service role key) can read secrets without needing direct
-- vault schema access (which PostgREST blocks by default).
--
-- Run this once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/rhnsjqqtdzlkvqazfcbg/sql
--
-- SECURITY: SECURITY DEFINER runs as the function owner (postgres superuser),
-- which has vault read access. No anon or authenticated user can call this
-- because the GRANT below only gives the service_role permission.

CREATE OR REPLACE FUNCTION public.engagera_get_secret(secret_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret
  FROM vault.decrypted_secrets
  WHERE name = secret_name
  LIMIT 1;
$$;

-- Only the service_role (used by the Express server) may call this function.
REVOKE ALL ON FUNCTION public.engagera_get_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engagera_get_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.engagera_get_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.engagera_get_secret(text) TO service_role;
