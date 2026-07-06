-- Atomically increments total_requests on an API key.
-- Called by the chat Edge Function after each successful API-key-authenticated request.
-- Uses SECURITY DEFINER so the function runs as the owner (service_role equivalent)
-- and can bypass RLS without requiring the caller to be service_role.

CREATE OR REPLACE FUNCTION public.engagera_increment_api_key_requests(p_key_id integer)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.engagera_api_keys
  SET total_requests = total_requests + 1
  WHERE id = p_key_id;
$$;

-- Only the service_role (used by Edge Functions) may call this.
REVOKE ALL ON FUNCTION public.engagera_increment_api_key_requests(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.engagera_increment_api_key_requests(integer) FROM anon;
REVOKE ALL ON FUNCTION public.engagera_increment_api_key_requests(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.engagera_increment_api_key_requests(integer) TO service_role;
