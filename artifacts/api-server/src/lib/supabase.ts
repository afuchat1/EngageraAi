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
 * Pre-bound to the `engagera` schema.
 * Always use this instead of supabaseAdmin.schema("engagera") directly
 * so every DB call is structurally scoped to Engagera — no leaks into public.
 */
export const engageraDb = supabaseAdmin.schema("engagera");
