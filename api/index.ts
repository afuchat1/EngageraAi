/**
 * Vercel Serverless Function — Express adapter
 *
 * Vercel routes all /api/* requests here. The Express app handles them
 * exactly as it would on a traditional Node.js server, including auth
 * middleware, Supabase queries, and response serialisation.
 *
 * Environment variables required in Vercel dashboard:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Supabase service role secret key
 *   OPENROUTER_API_KEY        — OpenRouter API key for AI completions
 *
 * Build-time env vars (also set in Vercel dashboard → Environment Variables):
 *   VITE_SUPABASE_URL         — same as SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY    — Supabase anon/public key
 */
import app from "../artifacts/api-server/src/app";

export default app;
