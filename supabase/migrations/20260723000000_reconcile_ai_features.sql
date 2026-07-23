-- Engagera AI feature reconciliation
-- Adds the settings, memory, and document-search tables used by the shared
-- chat function. This is intentionally additive and safe to run repeatedly.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

CREATE TABLE IF NOT EXISTS public.engagera_user_settings (
  id                   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  custom_system_prompt text,
  preferred_model      text NOT NULL DEFAULT 'engagera-pro',
  preferred_voice      text NOT NULL DEFAULT 'nova',
  agent_mode_enabled   boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS public.engagera_memories (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     text NOT NULL,
  importance  smallint NOT NULL DEFAULT 5,
  source      text NOT NULL DEFAULT 'extracted',
  tags        text[] NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS engagera_memories_user_idx
  ON public.engagera_memories(user_id, importance DESC, created_at DESC);

CREATE TABLE IF NOT EXISTS public.engagera_documents (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text NOT NULL,
  file_type  text NOT NULL DEFAULT 'text',
  size_chars integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.engagera_document_chunks (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES public.engagera_documents(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_text  text NOT NULL,
  fts         tsvector GENERATED ALWAYS AS (to_tsvector('english', chunk_text)) STORED
);

CREATE INDEX IF NOT EXISTS engagera_chunks_fts_idx
  ON public.engagera_document_chunks USING gin(fts);
CREATE INDEX IF NOT EXISTS engagera_chunks_user_idx
  ON public.engagera_document_chunks(user_id, document_id);

ALTER TABLE public.engagera_user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagera_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagera_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagera_document_chunks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagera_user_settings' AND policyname = 'Users manage own settings') THEN
    CREATE POLICY "Users manage own settings" ON public.engagera_user_settings
      FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagera_memories' AND policyname = 'Users manage own memories') THEN
    CREATE POLICY "Users manage own memories" ON public.engagera_memories
      FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagera_documents' AND policyname = 'Users manage own documents') THEN
    CREATE POLICY "Users manage own documents" ON public.engagera_documents
      FOR ALL USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'engagera_document_chunks' AND policyname = 'Users manage own chunks') THEN
    CREATE POLICY "Users manage own chunks" ON public.engagera_document_chunks
      FOR ALL USING (auth.uid() = user_id);
  END IF;
END
$$;

GRANT ALL ON public.engagera_user_settings TO authenticated, service_role;
GRANT ALL ON public.engagera_memories TO authenticated, service_role;
GRANT ALL ON public.engagera_documents TO authenticated, service_role;
GRANT ALL ON public.engagera_document_chunks TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.engagera_upsert_settings(
  p_user_id              uuid,
  p_custom_system_prompt text DEFAULT NULL,
  p_preferred_model      text DEFAULT NULL,
  p_preferred_voice      text DEFAULT NULL,
  p_agent_mode_enabled   boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.engagera_user_settings
    (user_id, custom_system_prompt, preferred_model, preferred_voice, agent_mode_enabled)
  VALUES
    (p_user_id, COALESCE(p_custom_system_prompt, ''), COALESCE(p_preferred_model, 'engagera-pro'),
     COALESCE(p_preferred_voice, 'nova'), COALESCE(p_agent_mode_enabled, false))
  ON CONFLICT (user_id) DO UPDATE SET
    custom_system_prompt = COALESCE(p_custom_system_prompt, public.engagera_user_settings.custom_system_prompt),
    preferred_model      = COALESCE(p_preferred_model, public.engagera_user_settings.preferred_model),
    preferred_voice      = COALESCE(p_preferred_voice, public.engagera_user_settings.preferred_voice),
    agent_mode_enabled   = COALESCE(p_agent_mode_enabled, public.engagera_user_settings.agent_mode_enabled),
    updated_at           = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.engagera_add_memories(
  p_user_id uuid,
  p_facts text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fact text;
BEGIN
  FOREACH fact IN ARRAY p_facts LOOP
    IF length(trim(fact)) > 0 AND NOT EXISTS (
      SELECT 1
      FROM public.engagera_memories
      WHERE user_id = p_user_id
        AND similarity(content, fact) > 0.7
    ) THEN
      INSERT INTO public.engagera_memories (user_id, content, importance, source)
      VALUES (p_user_id, trim(fact), 5, 'extracted');
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.engagera_search_chunks(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 4
)
RETURNS TABLE(document_title text, chunk_text text, rank real)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
    SELECT d.title, c.chunk_text,
           ts_rank(c.fts, websearch_to_tsquery('english', p_query)) AS rank
    FROM public.engagera_document_chunks c
    JOIN public.engagera_documents d ON d.id = c.document_id
    WHERE c.user_id = p_user_id
      AND c.fts @@ websearch_to_tsquery('english', p_query)
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.engagera_upsert_settings(uuid, text, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.engagera_add_memories(uuid, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.engagera_search_chunks(uuid, text, integer) TO service_role;