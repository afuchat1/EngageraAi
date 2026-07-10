---
name: Engagera admin dashboard
description: How admin gating, dataset review, and the admin frontend are wired for the Engagera platform.
---

Admin access is membership in `engagera_admins` (checked via `engagera_is_admin` SQL fn), not a role flag on the user. Grant by inserting `auth.users.id` — never grant broadly without asking which account, since this project has real users.

Edge Functions `admin`, `reviewer`, `dataset-export` are proxied through `artifacts/api-server` at `/api/admin/*`, `/api/reviewer/*`, `/api/dataset-export`, forwarding the caller's Supabase JWT as-is (no API-key header rewriting, unlike the `eng_...` key path).

**Why:** admin-only surfaces should reuse the existing session JWT (proxyToEdge's default Authorization passthrough), not the anon-key-substitution logic built for developer API keys.

Frontend admin pages (`artifacts/engagera/src/pages/admin/*`) do **not** use the generated `@workspace/api-client-react` hooks — that client is generated from an OpenAPI spec that doesn't cover these internal admin endpoints. Instead they use a hand-written `customFetch`-based hook layer in `src/lib/adminApi.ts`.

**How to apply:** if `@workspace/api-client-react`'s `customFetch`/`ApiError` aren't exported from its `index.ts`, add them there rather than reaching into `custom-fetch.ts` internals from app code.

Admin route gating in the frontend (`AdminRoute` in `App.tsx`) infers admin status from whether `/api/admin/overview` succeeds (401/403 → redirect), since there's no separate "am I admin" endpoint.
