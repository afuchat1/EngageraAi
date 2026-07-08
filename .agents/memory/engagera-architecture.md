---
name: Engagera architecture
description: Core architecture decision — fully client-side + Supabase; no server-side code used in production
---

# Engagera architecture

## Rule
The project is **fully Supabase** — no server-side Express code is used in production.

**Why:** The owner confirmed this explicitly. All API logic lives in the 8 Supabase Edge Functions. The frontend calls them directly at `${SUPABASE_URL}/functions/v1/*`.

**How to apply:**
- Any new feature that needs backend logic → Supabase Edge Function, not the API server
- Fixes to auth, data, AI routing → look in `supabase/functions/`, not `artifacts/api-server/`
- `artifacts/api-server` exists in the repo but is not the production path; do not rely on it for critical fixes
- `chat` is deployed with `--no-verify-jwt`; the Edge Function handles all auth itself (JWT, eng_ keys, guest sessions)
- Docs `BASE_URL` = `${SUPABASE_URL}/functions/v1` — correct and must stay pointed there
