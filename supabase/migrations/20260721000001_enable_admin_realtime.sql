-- Enable Supabase Realtime on the tables the admin dashboard watches so that
-- usage rows and key updates push to the client the moment they are written,
-- instead of waiting for the 30-second polling interval.

-- REPLICA IDENTITY FULL is required so that UPDATE/DELETE events carry the
-- full old row (needed for accurate change detection on the client).
ALTER TABLE public.engagera_usage_records REPLICA IDENTITY FULL;
ALTER TABLE public.engagera_api_keys      REPLICA IDENTITY FULL;

-- Add both tables to the default Supabase Realtime publication so that
-- postgres_changes subscriptions fire on INSERT / UPDATE / DELETE.
DO $$
BEGIN
  -- engagera_usage_records
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'engagera_usage_records'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.engagera_usage_records;
  END IF;

  -- engagera_api_keys
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'engagera_api_keys'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.engagera_api_keys;
  END IF;
END $$;
