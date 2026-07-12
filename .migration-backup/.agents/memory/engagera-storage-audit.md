---
name: Engagera storage audit
description: Database isolation audit — what was found, fixed, and what env vars are required vs forbidden
---

# Engagera Storage Audit

## What was confirmed working
- All API routes use `engageraDb` (Supabase JS client) — no direct PostgreSQL
- Auth middleware (`requireAuth`, `optionalAuth`) uses `supabaseAdmin.auth.getUser()` — Supabase JWT only
- Frontend uses `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` — correct public keys

## What was found and fixed
- `lib/db/` (Drizzle + `DATABASE_URL`) was listed as `@workspace/db` dependency in api-server but NEVER imported — dead code
- Removed `@workspace/db` and `drizzle-orm` from `artifacts/api-server/package.json`
- An `engagera` PostgreSQL schema existed with empty `api_keys` and `usage_records` tables (0 rows each) — artifact from early Drizzle-based development; DROPPED via Supabase Management API
- Added URL validation guard in `supabase.ts` that throws if URL looks like localhost or .replit.

## Required env vars (API server)
- `SUPABASE_URL` — must be `https://<ref>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — service role key

## Required env vars (frontend)
- `VITE_SUPABASE_URL` — same URL, public-safe
- `VITE_SUPABASE_ANON_KEY` — anon key, public-safe

## Env vars to REMOVE
- `DATABASE_URL` — no longer needed; pointed to Supabase PostgreSQL directly (not Replit DB), but the Drizzle package that used it is now removed

## Active Engagera tables (public schema, confirmed with row counts)
- `public.engagera_api_keys` (9 cols, has data)
- `public.engagera_conversations` (8 cols, has data)
- `public.engagera_messages` (6 cols, has data)
- `public.engagera_usage_records` (8 cols, has data)
- `public.engagera_guest_sessions` (4 cols, has data)

**Why:** `engageraDb` is an alias for `supabaseAdmin`. PostgREST exposes only the `public` schema by default, so the `engagera_` prefix provides namespace isolation without needing a separate schema.
