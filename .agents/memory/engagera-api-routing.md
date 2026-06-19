---
name: Engagera API routing
description: How /api/* calls from generated hooks are routed to Supabase Edge Functions via setUrlMapper
---

## Rule
All `@workspace/api-client-react` generated hooks call `/api/...` paths. A `setUrlMapper` configured in `App.tsx` rewrites them to Supabase Edge Function URLs before the fetch fires.

## Mapping table (path prefix → Edge Function)
- `/api/models` → `${FN_BASE}/models`
- `/api/api-keys` → `${FN_BASE}/api-keys` (preserves subpath, e.g. `/api/api-keys/123` → `.../api-keys/123`)
- `/api/usage/summary` → `${FN_BASE}/usage/summary` (checked BEFORE /api/usage)
- `/api/usage` → `${FN_BASE}/usage` (preserves query string, e.g. `?days=7`)
- `/api/dashboard` → `${FN_BASE}/dashboard` (strips `/stats` subpath — Edge Fn has no subpath)
- `/api/chat` → `${FN_BASE}/chat`
- `/api/conversations` → `${FN_BASE}/conversations` (preserves subpath for `/{id}` and `/{id}/messages`)
- `/api/healthz` → `${FN_BASE}/status`

## Auth
- `setAuthTokenGetter` returns Supabase session JWT for authenticated users
- `setFallbackBearerToken(SUPABASE_ANON_KEY)` sends anon key when JWT is null (guests)
- Dashboard/api-keys/usage Edge Functions call `requireAuth` internally → 401 for guests is expected; UI shows "sign in" banner

## Where configured
`artifacts/engagera/src/App.tsx` — module-level (runs once on import, before any render)

**Why:** The generated API client is hardcoded to `/api/*` paths (can't be changed without re-running codegen). The URL mapper intercepts and rewrites these paths so the Express server is bypassed entirely for API calls.

**How to apply:** When adding a new Edge Function that the frontend must call via the generated client, add a new entry to the `setUrlMapper` function in `App.tsx`. Order matters — check more specific prefixes (e.g. `/usage/summary`) before less specific ones (e.g. `/usage`).
