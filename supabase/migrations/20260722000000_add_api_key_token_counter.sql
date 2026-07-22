-- Migration: add total_tokens atomic counter to engagera_api_keys
-- Mirrors the existing total_requests counter so token burn is always accurate
-- even when usage_records rows are missing api_key_id (pre-fix records).

-- 1. Add the column
ALTER TABLE public.engagera_api_keys
  ADD COLUMN IF NOT EXISTS total_tokens bigint NOT NULL DEFAULT 0;

-- 2. Backfill from usage_records for any rows that DO have api_key_id set
UPDATE public.engagera_api_keys k
SET total_tokens = COALESCE((
  SELECT SUM(r.total_tokens)
  FROM public.engagera_usage_records r
  WHERE r.api_key_id = k.id
), 0);

-- 3. Replace the RPC so it also accepts and increments p_tokens
CREATE OR REPLACE FUNCTION public.engagera_increment_api_key_usage(
  p_key_id bigint,
  p_tokens  bigint DEFAULT 0
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.engagera_api_keys
  SET
    total_requests = COALESCE(total_requests, 0) + 1,
    total_tokens   = COALESCE(total_tokens,   0) + p_tokens,
    last_used_at   = NOW()
  WHERE id = p_key_id;
$$;

-- Re-grant (function signature changed, so the old grant no longer covers it)
GRANT EXECUTE ON FUNCTION public.engagera_increment_api_key_usage(bigint, bigint) TO service_role;
