import { createClient } from "@supabase/supabase-js";

// Public Supabase project credentials.
// These are safe to commit — the anon key is designed for client-side use
// and is protected by Supabase Row Level Security.
// Set VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in your build environment
// to override (e.g. for a different Supabase project).
const FALLBACK_URL  = "https://rhnsjqqtdzlkvqazfcbg.supabase.co";
const FALLBACK_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";

const supabaseUrl     = (import.meta.env.VITE_SUPABASE_URL     as string | undefined) || FALLBACK_URL;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || FALLBACK_ANON;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const SUPABASE_URL      = supabaseUrl;
export const SUPABASE_ANON_KEY = supabaseAnonKey;
