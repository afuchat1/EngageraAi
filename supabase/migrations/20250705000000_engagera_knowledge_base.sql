-- Cross-user shared knowledge base
-- Run this once in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/rhnsjqqtdzlkvqazfcbg/sql/new
--
-- Facts learned by ANY user are cached and shared with ALL users.
-- TTLs: price=12h · volatile=7d · general=3d · stable=30d

CREATE TABLE IF NOT EXISTS public.engagera_knowledge_base (
  id          bigserial PRIMARY KEY,
  topic_key   text        UNIQUE NOT NULL,
  question    text        NOT NULL,
  search_text text        NOT NULL,
  sources     jsonb       NOT NULL DEFAULT '[]',
  category    text        NOT NULL DEFAULT 'general',
  hit_count   integer     NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_engagera_kb_topic
  ON public.engagera_knowledge_base (topic_key);

CREATE INDEX IF NOT EXISTS idx_engagera_kb_expires
  ON public.engagera_knowledge_base (expires_at)
  WHERE expires_at IS NOT NULL;

-- Allow the service role (Edge Functions) full access
GRANT ALL ON public.engagera_knowledge_base TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_knowledge_base_id_seq TO service_role;

-- No anon/authenticated access — shared knowledge is internal only
REVOKE ALL ON public.engagera_knowledge_base FROM anon, authenticated;
