---
name: Engagera DB convention
description: All Engagera tables are in the public schema with engagera_ prefix; access via engageraDb alias
---

All Engagera tables live in the `public` PostgreSQL schema with an `engagera_` prefix (NOT in a separate `engagera` schema — PostgREST only exposes `public` by default).

Tables:
- `public.engagera_api_keys`
- `public.engagera_usage_records`
- `public.engagera_conversations`
- `public.engagera_messages`
- `public.engagera_guest_sessions`

SQL helper functions (SECURITY DEFINER, service_role grant):
- `public.engagera_increment_guest_count(p_session_id text) → integer`
- `public.engagera_increment_message_count(p_conversation_id bigint) → void`

**Why:** PostgREST only exposes `public` by default. Changing db_schema config via the Supabase Management API was not achievable via the API endpoint available. The `engagera_` prefix achieves the same isolation and branding.

**How to apply:** Always use `engageraDb` (alias for `supabaseAdmin` in `artifacts/api-server/src/lib/supabase.ts`) for any Engagera table access. Never call `supabaseAdmin.from(...)` directly in Engagera routes — use `engageraDb.from(...)` so future devs can grep for one symbol.
