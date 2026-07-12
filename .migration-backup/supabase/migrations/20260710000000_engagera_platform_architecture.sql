-- Engagera AI Platform architecture: separates API traffic from Dashboard Chat,
-- adds Dataset Candidates + AI Reviewer, Dataset Versions, Model Registry,
-- Training Jobs, and Admin roles.
--
-- Run via: supabase db push --use-api (SUPABASE_ACCESS_TOKEN required)

-- ── Admins ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_admins (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.engagera_admins TO service_role;
REVOKE ALL ON public.engagera_admins FROM anon, authenticated;

-- ── API Logs (developer API-key traffic only — NEVER dashboard chats) ──────
CREATE TABLE IF NOT EXISTS public.engagera_api_logs (
  id               bigserial PRIMARY KEY,
  api_key_id       integer REFERENCES public.engagera_api_keys(id) ON DELETE SET NULL,
  user_id          uuid,
  model            text NOT NULL,
  endpoint         text NOT NULL DEFAULT '/chat',
  status_code      integer NOT NULL DEFAULT 200,
  latency_ms       integer,
  input_tokens     integer NOT NULL DEFAULT 0,
  output_tokens    integer NOT NULL DEFAULT 0,
  total_tokens     integer NOT NULL DEFAULT 0,
  error_message    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engagera_api_logs_key ON public.engagera_api_logs (api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagera_api_logs_user ON public.engagera_api_logs (user_id, created_at DESC);
GRANT ALL ON public.engagera_api_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_api_logs_id_seq TO service_role;
REVOKE ALL ON public.engagera_api_logs FROM anon, authenticated;

-- ── Dataset Candidates ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_dataset_candidates (
  id                 bigserial PRIMARY KEY,
  request            text NOT NULL,
  response           text NOT NULL,
  model              text NOT NULL,
  api_key_id         integer REFERENCES public.engagera_api_keys(id) ON DELETE SET NULL,
  language           text DEFAULT 'en',
  category           text DEFAULT 'general',
  content_hash       text,
  quality_score       numeric(5,2),
  safety_score        numeric(5,2),
  duplicate_score     numeric(5,2),
  hallucination_score numeric(5,2),
  reviewer_status    text NOT NULL DEFAULT 'pending'
                       CHECK (reviewer_status IN ('pending','approved','rejected')),
  reviewer_notes     text,
  approved_at        timestamptz,
  dataset_version    text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engagera_dc_status ON public.engagera_dataset_candidates (reviewer_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_engagera_dc_hash ON public.engagera_dataset_candidates (content_hash);
GRANT ALL ON public.engagera_dataset_candidates TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_dataset_candidates_id_seq TO service_role;
REVOKE ALL ON public.engagera_dataset_candidates FROM anon, authenticated;

-- ── Reviewer Logs (audit trail of every automatic/manual review decision) ──
CREATE TABLE IF NOT EXISTS public.engagera_reviewer_logs (
  id             bigserial PRIMARY KEY,
  candidate_id   bigint NOT NULL REFERENCES public.engagera_dataset_candidates(id) ON DELETE CASCADE,
  reviewer       text NOT NULL DEFAULT 'ai',
  decision       text NOT NULL,
  scores         jsonb NOT NULL DEFAULT '{}',
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engagera_reviewer_logs_candidate ON public.engagera_reviewer_logs (candidate_id);
GRANT ALL ON public.engagera_reviewer_logs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_reviewer_logs_id_seq TO service_role;
REVOKE ALL ON public.engagera_reviewer_logs FROM anon, authenticated;

-- ── Dataset Versions (immutable, append-only snapshots) ────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_dataset_versions (
  id             bigserial PRIMARY KEY,
  version        text UNIQUE NOT NULL,
  storage_path   text NOT NULL,
  example_count  integer NOT NULL DEFAULT 0,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid
);
GRANT ALL ON public.engagera_dataset_versions TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_dataset_versions_id_seq TO service_role;
REVOKE ALL ON public.engagera_dataset_versions FROM anon, authenticated;

-- ── Model Registry ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.engagera_model_registry (
  id                     bigserial PRIMARY KEY,
  model_key              text UNIQUE NOT NULL,
  display_name           text NOT NULL,
  version                text NOT NULL DEFAULT '0.1.0',
  release_date           date,
  dataset_version_used   text,
  training_status        text NOT NULL DEFAULT 'not_started'
                            CHECK (training_status IN ('not_started','queued','training','completed','failed')),
  performance_metrics    jsonb NOT NULL DEFAULT '{}',
  deployment_status      text NOT NULL DEFAULT 'external_fallback'
                            CHECK (deployment_status IN ('external_fallback','staging','production','disabled')),
  backend_provider_chain jsonb NOT NULL DEFAULT '[]',
  rollback_of            text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.engagera_model_registry TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_model_registry_id_seq TO service_role;
REVOKE ALL ON public.engagera_model_registry FROM anon, authenticated;

-- ── Training Jobs (infrastructure placeholder — no GPU execution yet) ──────
CREATE TABLE IF NOT EXISTS public.engagera_training_jobs (
  id              bigserial PRIMARY KEY,
  model_key       text NOT NULL REFERENCES public.engagera_model_registry(model_key) ON DELETE CASCADE,
  dataset_version text NOT NULL,
  status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','running','completed','failed','cancelled')),
  logs            jsonb NOT NULL DEFAULT '[]',
  metrics         jsonb NOT NULL DEFAULT '{}',
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_engagera_training_jobs_model ON public.engagera_training_jobs (model_key, created_at DESC);
GRANT ALL ON public.engagera_training_jobs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.engagera_training_jobs_id_seq TO service_role;
REVOKE ALL ON public.engagera_training_jobs FROM anon, authenticated;

-- ── Helper: check if a given auth user is an Engagera admin ────────────────
CREATE OR REPLACE FUNCTION public.engagera_is_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.engagera_admins WHERE user_id = p_user_id);
$$;
REVOKE ALL ON FUNCTION public.engagera_is_admin(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.engagera_is_admin(uuid) TO service_role;

-- ── Seed the initial Model Registry (all currently backed by external providers) ──
INSERT INTO public.engagera_model_registry (model_key, display_name, deployment_status, backend_provider_chain)
VALUES
  ('engagera-lite',      'Engagera Lite',      'external_fallback', '["groq"]'),
  ('engagera-pro',       'Engagera Pro',       'external_fallback', '["groq","openai","deepseek"]'),
  ('engagera-reasoning', 'Engagera Reasoning', 'external_fallback', '["deepseek","gemini"]'),
  ('engagera-write',     'Engagera Write',     'external_fallback', '["openai","gemini"]'),
  ('engagera-code',      'Engagera Code',      'external_fallback', '["deepseek","groq"]'),
  ('engagera-vision',    'Engagera Vision',    'external_fallback', '["gemini","openai"]')
ON CONFLICT (model_key) DO NOTHING;
