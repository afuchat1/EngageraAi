-- Migration: atomic API key usage increment
-- Fixes: total_requests on engagera_api_keys was never incremented because
-- a non-atomic select→update pattern was needed. This function does it in
-- a single SQL statement, safe under concurrent requests.

CREATE OR REPLACE FUNCTION engagera_increment_api_key_usage(p_key_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE engagera_api_keys
  SET
    total_requests = COALESCE(total_requests, 0) + 1,
    last_used_at   = NOW()
  WHERE id = p_key_id;
END;
$$;

-- Grant execute to the service role so edge functions can call it
GRANT EXECUTE ON FUNCTION engagera_increment_api_key_usage(bigint) TO service_role;
