# Engagera — AfuAI Unified Developer Platform

Engagera is the official AI platform of AfuChat under AfuAI. A unified AI system providing a single API, SDKs, and web dashboard for developers to access AI capabilities through one interface — fully hiding all underlying AI providers.

## Run & Operate

- `PORT=5000 pnpm --filter @workspace/engagera run dev` — run the frontend on Replit (port 5000)
- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (artifacts/engagera)
- API: Express 5 (artifacts/api-server)
- Auth & DB: Supabase (shared project with AfuChat — `afuchat.new`, project ID: rhnsjqqtdzlkvqazfcbg)
- Schema: `engagera` schema in Supabase Postgres (separate from AfuChat's `public` schema)
- AI Routing: OpenRouter free models via routing engine in `artifacts/api-server/src/lib/aiRouter.ts`
- API Contracts: OpenAPI spec → Orval codegen → React Query hooks + Zod schemas
- Build: esbuild (CJS bundle)

## Where things live

- `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- `lib/api-client-react/src/generated/` — generated React Query hooks (do not edit)
- `lib/api-zod/src/generated/` — generated Zod validation schemas (do not edit)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/lib/aiRouter.ts` — AI routing engine (model mapping + failover)
- `artifacts/api-server/src/lib/supabase.ts` — Supabase admin client
- `artifacts/api-server/src/middlewares/requireAuth.ts` — JWT auth middleware
- `artifacts/engagera/src/` — React frontend

## Architecture decisions

- **Engagera schema isolation**: All tables live in the `engagera` Postgres schema, not `public`. AfuChat's tables are untouched.
- **Auth via Supabase JWT**: The frontend passes Supabase session tokens as `Authorization: Bearer` via `setAuthTokenGetter`. The backend verifies with `supabaseAdmin.auth.getUser(token)`.
- **Provider hiding**: The AI routing engine in `aiRouter.ts` maps Engagera model IDs to internal free models (via OpenRouter). No provider names ever reach the client.
- **Failover**: If the primary model fails, the router tries fallback models in order. If all fail, a safe message is returned.
- **Free models**: Uses OpenRouter free tier models (llama-3.3-70b, deepseek-r1, qwen-2.5-coder, etc.) to keep costs near zero.

## Product

Engagera provides:
- 6 Engagera-branded AI models (Lite, Pro, Reason, Code, Vision, Voice)
- Public REST API with API key auth for external developers
- Developer dashboard: API key management, usage analytics, billing
- AI playground for interactive testing
- Documentation center with SDK guides

## Supabase Tables (engagera schema)

- `engagera.api_keys` — user API keys with hashed secrets, prefix, active status
- `engagera.usage_records` — per-request token usage records per user/model

## Engagera Model → Provider Mapping

| Engagera Model     | Internal (OpenRouter)                            |
|--------------------|--------------------------------------------------|
| engagera-lite      | meta-llama/llama-3.1-8b-instruct:free            |
| engagera-pro       | meta-llama/llama-3.3-70b-instruct:free           |
| engagera-reason    | deepseek/deepseek-r1:free                        |
| engagera-code      | qwen/qwen-2.5-coder-32b-instruct:free            |
| engagera-vision    | google/gemma-3-27b-it:free                       |
| engagera-voice     | meta-llama/llama-3.1-8b-instruct:free            |

## Gotchas

- **Run codegen after spec changes**: `pnpm --filter @workspace/api-spec run codegen`
- **Supabase schema**: Always use `.schema("engagera")` before `.from(...)` in the admin client
- **VITE_ prefix**: Frontend env vars must be prefixed with `VITE_` (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY)
- **OpenRouter key optional**: The AI router works without `OPENROUTER_API_KEY` for free models (rate limits apply). Add a key for higher limits.
- **Never expose internal model names**: The `internalModel` field in `aiRouter.ts` must never reach API responses.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
