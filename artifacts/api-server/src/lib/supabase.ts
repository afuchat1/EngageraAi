import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// STORAGE RULE — read this before every DB call
// ─────────────────────────────────────────────────────────────────────────────
// ALL Engagera data lives in Supabase only. No other database is used.
// Replit's built-in PostgreSQL (DATABASE_URL) is intentionally NOT connected.
//
// Table convention: public schema, engagera_ prefix
//   public.engagera_api_keys        — user API keys (SHA-256 hashed, prefix only stored)
//   public.engagera_conversations   — chat conversations (auth + guest)
//   public.engagera_messages        — per-message content
//   public.engagera_usage_records   — per-request token usage
//   public.engagera_guest_sessions  — guest rate-limit tracking
//
// Access rule:
//   ✅ ALL queries go through `engageraDb`
//   ✅ ONLY query tables with the engagera_ prefix
//   ❌ NEVER use supabaseAdmin.from() directly — always use engageraDb
//   ❌ NEVER query tables that don't start with engagera_
//   ❌ NEVER connect via DATABASE_URL or any direct PostgreSQL connection
//   ❌ NEVER use Supabase Storage buckets — use Cloudflare R2 for files
// ─────────────────────────────────────────────────────────────────────────────

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error(
    "[Engagera] SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. " +
    "These are the only env vars needed. DATABASE_URL must NOT be set or used."
  );
}

if (
  supabaseUrl.includes("localhost") ||
  supabaseUrl.includes("127.0.0.1") ||
  supabaseUrl.includes(".replit.")
) {
  throw new Error(
    `[Engagera] SUPABASE_URL looks invalid: "${supabaseUrl}". ` +
    "Must be a real Supabase project URL (https://<ref>.supabase.co)."
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// engageraDb is the ONLY database handle for all Engagera DB operations.
// Grep for "engageraDb" to find every database call in this codebase.
export const engageraDb = supabaseAdmin;
