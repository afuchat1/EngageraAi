/**
 * SUPABASE ACCESS — READ BEFORE TOUCHING
 *
 * The Express API server is a zero-secret thin proxy.
 * ALL database access and ALL secrets (OPENROUTER_API_KEY, SUPABASE_SERVICE_ROLE_KEY)
 * live exclusively in Supabase Edge Functions — never here.
 *
 * Only SUPABASE_URL (public) is used to build the Edge Function target URLs.
 * See artifacts/api-server/src/lib/proxy.ts
 *
 * Tables (Supabase only — engagera_ prefix):
 *   public.engagera_api_keys
 *   public.engagera_conversations
 *   public.engagera_messages
 *   public.engagera_usage_records
 *   public.engagera_guest_sessions
 */

export {};
