# Engagera

Engagera is an AI chat assistant web app (multi-model chat, usage tracking, API keys, admin/reviewer tooling) ported from Vercel into this Replit pnpm workspace.

## Run & Operate

- `pnpm --filter @workspace/engagera run dev` — run the web app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from `lib/api-spec/openapi.yaml` (used only to keep generated React Query hook names stable; see Architecture decisions)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React 19 + Vite + wouter, Tailwind, shadcn/radix UI
- Backend/auth/data: **Supabase** (Postgres, Auth, Edge Functions) — external, not part of this workspace
- API codegen: Orval (from `lib/api-spec/openapi.yaml`) generates typed React Query hooks purely for developer ergonomics

## Where things live

- `artifacts/engagera/` — the only artifact. All app code, pages, and routes live here.
- `lib/api-spec/openapi.yaml` — documents the shape of the Supabase Edge Function endpoints the frontend calls (models, api-keys, usage, dashboard, chat, conversations, admin, reviewer, dataset-export). Purely descriptive — nothing here is served by this workspace.
- `artifacts/engagera/src/App.tsx` — the `setUrlMapper` call here is the single source of truth for how every `/api/*` path is rewritten to a real Supabase Edge Function URL (`${SUPABASE_URL}/functions/v1/...`). Anyone adding a new endpoint must add a mapping here.
- `artifacts/engagera/src/lib/supabase.ts` — Supabase client + public URL/anon key (safe to commit; scoped by Supabase RLS).
- `attached_assets/` — image assets referenced via the `@assets` Vite alias.
- `lib/db/` — scaffold Drizzle/Postgres package, intentionally left empty/unused. This app does not use a local database.

## Architecture decisions

- **No Express API server.** The original Vercel deployment had a thin Express proxy in front of Supabase; it added no logic of its own (every route just forwarded to a Supabase Edge Function, or in two dead-code cases — `devChat`/`stt` — duplicated logic Supabase already had). Per explicit instruction, the app now calls Supabase Edge Functions directly from the browser via `setUrlMapper`/`setFallbackBearerToken`/`setGuestSessionId` in `@workspace/api-client-react`. There is intentionally no `artifacts/api-server`.
- **Supabase is the only backend.** Auth, database, and all business logic (chat, usage, admin, reviewer, dataset export, speech-to-text) live in Supabase Edge Functions, outside this repo. Do not migrate this data/logic into the workspace's `lib/db` Drizzle package.
- **OpenAPI spec is descriptive-only here.** Normally `lib/api-spec/openapi.yaml` gates a real backend; in this app it exists solely so Orval can generate nicely-typed React Query hooks (`@workspace/api-client-react`) for calling Supabase — there is no server implementing these routes in this workspace.

## Product

Chat with multiple AI models (auto-routing between lite/pro/vision), guest mode with a message limit, sign-up/sign-in, per-user usage dashboard, API key management, and an admin area (dataset review, model registry, analytics, storage) gated by role.

## User preferences

- Do not migrate Supabase (auth/DB/Edge Functions) into the workspace's local Postgres/Drizzle package — Supabase must remain the source of truth for data and auth.
- Do not add any local API server — all backend calls must go directly to Supabase.

## Gotchas

- The `/api/*` paths used by generated hooks are never actually requested from this workspace's origin — `setUrlMapper` in `App.tsx` intercepts them client-side and rewrites to Supabase before `fetch` runs. If a network call for `/api/...` unexpectedly hits this app's own dev server, it's because a new endpoint was called without adding a mapping.
- `usePhoneVoice.ts` calls the Supabase `stt` Edge Function directly with a hardcoded URL (bypassing `customFetch`) — keep it in sync with `SUPABASE_URL` if the Supabase project ever changes.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
