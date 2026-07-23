-- ══════════════════════════════════════════════════════════════════════════════
-- Engagera AI Features Migration — v2
-- Adds: user settings, long-term memory, RAG documents, pgvector support
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Enable extensions ─────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for full-text similarity search
-- pgvector (enable if available in your plan)
CREATE EXTENSION IF NOT EXISTS "vector" WITH SCHEMA extensions;

-- ── User Settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_user_settings (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_system_prompt text,                          -- user's personal AI instructions
  preferred_model      text DEFAULT 'engagera-pro',  -- model alias
  preferred_voice      text DEFAULT 'nova',           -- TTS voice
  agent_mode_enabled   boolean DEFAULT false,         -- autonomous tool-use loop
  created_at           timestamptz DEFAULT now() NOT NULL,
  updated_at           timestamptz DEFAULT now() NOT NULL,
  UNIQUE (user_id)
);

ALTER TABLE public.engagera_user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON public.engagera_user_settings
  FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.engagera_user_settings TO authenticated;
GRANT ALL ON public.engagera_user_settings TO service_role;

-- ── Long-term Memory ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_memories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,              -- e.g. "User works in finance"
  importance  smallint DEFAULT 5,        -- 1 (low) to 10 (high)
  source      text DEFAULT 'extracted',  -- 'extracted' | 'user_added'
  tags        text[] DEFAULT '{}',
  created_at  timestamptz DEFAULT now() NOT NULL,
  updated_at  timestamptz DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS engagera_memories_user_idx ON public.engagera_memories(user_id, importance DESC, created_at DESC);

ALTER TABLE public.engagera_memories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own memories" ON public.engagera_memories
  FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.engagera_memories TO authenticated;
GRANT ALL ON public.engagera_memories TO service_role;

-- ── RAG Documents ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_documents (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title        text NOT NULL,
  file_type    text DEFAULT 'text',  -- 'text' | 'pdf' | 'markdown'
  size_chars   integer DEFAULT 0,
  created_at   timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.engagera_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own documents" ON public.engagera_documents
  FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.engagera_documents TO authenticated;
GRANT ALL ON public.engagera_documents TO service_role;

-- ── Document Chunks (for RAG retrieval) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_document_chunks (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id  bigint NOT NULL REFERENCES public.engagera_documents(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index  integer NOT NULL,
  chunk_text   text NOT NULL,
  fts          tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED
);

CREATE INDEX IF NOT EXISTS engagera_chunks_fts_idx  ON public.engagera_document_chunks USING gin(fts);
CREATE INDEX IF NOT EXISTS engagera_chunks_user_idx ON public.engagera_document_chunks(user_id, document_id);

ALTER TABLE public.engagera_document_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own chunks" ON public.engagera_document_chunks
  FOR ALL USING (auth.uid() = user_id);
GRANT ALL ON public.engagera_document_chunks TO authenticated;
GRANT ALL ON public.engagera_document_chunks TO service_role;

-- ── RPC: Upsert user settings ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engagera_upsert_settings(
  p_user_id              uuid,
  p_custom_system_prompt text    DEFAULT NULL,
  p_preferred_model      text    DEFAULT NULL,
  p_preferred_voice      text    DEFAULT NULL,
  p_agent_mode_enabled   boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO engagera_user_settings (user_id, custom_system_prompt, preferred_model, preferred_voice, agent_mode_enabled)
    VALUES (p_user_id,
            COALESCE(p_custom_system_prompt, ''),
            COALESCE(p_preferred_model, 'engagera-pro'),
            COALESCE(p_preferred_voice, 'nova'),
            COALESCE(p_agent_mode_enabled, false))
  ON CONFLICT (user_id) DO UPDATE SET
    custom_system_prompt = COALESCE(p_custom_system_prompt, engagera_user_settings.custom_system_prompt),
    preferred_model      = COALESCE(p_preferred_model,      engagera_user_settings.preferred_model),
    preferred_voice      = COALESCE(p_preferred_voice,      engagera_user_settings.preferred_voice),
    agent_mode_enabled   = COALESCE(p_agent_mode_enabled,   engagera_user_settings.agent_mode_enabled),
    updated_at           = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.engagera_upsert_settings TO service_role;

-- ── RPC: Save extracted memories ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engagera_add_memories(
  p_user_id uuid,
  p_facts   text[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY p_facts LOOP
    -- Only insert if a very similar memory doesn't already exist
    IF NOT EXISTS (
      SELECT 1 FROM engagera_memories
      WHERE user_id = p_user_id
        AND similarity(content, f) > 0.7
    ) THEN
      INSERT INTO engagera_memories (user_id, content, importance, source)
        VALUES (p_user_id, f, 5, 'extracted');
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.engagera_add_memories TO service_role;

-- ── RPC: Full-text search document chunks ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engagera_search_chunks(
  p_user_id uuid,
  p_query   text,
  p_limit   integer DEFAULT 4
)
RETURNS TABLE(document_title text, chunk_text text, rank real)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT d.title, c.chunk_text,
           ts_rank(c.fts, websearch_to_tsquery('english', p_query)) AS rank
    FROM engagera_document_chunks c
    JOIN engagera_documents d ON d.id = c.document_id
    WHERE c.user_id = p_user_id
      AND c.fts @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$;
GRANT EXECUTE ON FUNCTION public.engagera_search_chunks TO service_role;
