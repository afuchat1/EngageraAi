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
 * Engagera tables live in the public schema with an `engagera_` prefix.
 * All DB access goes through this alias so the table naming convention
 * is explicit and consistent everywhere.
 *
 * Tables:
 *   public.engagera_api_keys
 *   public.engagera_usage_records
 */
export const engageraDb = supabaseAdmin;
