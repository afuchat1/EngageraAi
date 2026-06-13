import { createClient } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────────────────
// These two VITE_ env vars must be set at build time.
// Add them to your Replit Secrets (or .env for local dev).
// ─────────────────────────────────────────────────────────────────────────────
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || supabaseUrl.includes("placeholder")) {
  throw new Error(
    "[Engagera] VITE_SUPABASE_URL is not set. " +
    "Add it to Replit Secrets and restart the frontend workflow.",
  );
}

if (!supabaseAnonKey || supabaseAnonKey.includes("placeholder")) {
  throw new Error(
    "[Engagera] VITE_SUPABASE_ANON_KEY is not set. " +
    "Add it to Replit Secrets and restart the frontend workflow.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
