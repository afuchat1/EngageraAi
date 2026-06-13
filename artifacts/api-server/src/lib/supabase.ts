import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENGAGERA DATABASE CONVENTION
 * ─────────────────────────────────────────────────────────────────────────────
 * All Engagera tables live in the PUBLIC schema with an `engagera_` prefix.
 * This is intentional: Supabase PostgREST only exposes `public` by default.
 *
 * ALL access goes through `engageraDb` (not `supabaseAdmin` directly) so the
 * convention is enforced and future devs can grep for `engageraDb` to find
 * every Engagera DB call.
 *
 * Tables (never add AfuChat tables here — they live in `public` without prefix):
 *   public.engagera_api_keys          — user API keys
 *   public.engagera_usage_records     — per-request token usage
 *   public.engagera_conversations     — chat conversations (auth + guest)
 *   public.engagera_messages          — individual messages per conversation
 *   public.engagera_guest_sessions    — guest rate-limit tracking
 * ─────────────────────────────────────────────────────────────────────────────
 */
export const engageraDb = supabaseAdmin;
