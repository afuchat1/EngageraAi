---
name: Engagera edge function
description: Chat AI calls go through a Supabase Edge Function; OPENROUTER_API_KEY stored as Supabase Edge Function secret only; Express /api/chat is a thin proxy
---

# Engagera Edge Function Architecture

## Current architecture (Express = thin proxy)
- Express `POST /api/chat` **proxies** directly to the Supabase `chat` edge function.
- The edge function handles: OpenRouter call, guest rate-limiting, engagera_* DB writes.
- `aiRouter.ts` now only exports `getEngageraModels()` — no OpenRouter code.
- Express API server handles directly: `/api/models`, `/api/api-keys`, `/api/conversations`, `/api/usage`, `/api/dashboard`

## Why vault doesn't work for key retrieval
- Supabase PostgREST blocks the `vault` schema (PGRST106). Vault was empty anyway.
- Edge Function secrets API only returns SHA-256 hashes — actual values unreadable.
- Management API multipart upload for new edge functions returns 500 (Supabase server issue).
- **Solution**: proxy to existing `chat` edge function that already holds the key.

## Proxy headers forwarded by Express
- `Authorization: Bearer <jwt>` (authenticated users)
- `x-guest-session-id: <id>` (guests)
- Body: `{ messages, model, conversationId }`

## AI Identity System Prompt
- Both the edge function (`supabase/functions/chat/index.ts`) AND the Express AI router (`artifacts/api-server/src/lib/aiRouter.ts`) inject a system prompt
- Prompt establishes identity as "Engagera AI built by AfuAI team" and explicitly forbids claiming to be ChatGPT, Claude, etc.
- Prompt is prepended only if no existing system message is present

## Edge function details
- Slug: `chat`
- URL: `https://rhnsjqqtdzlkvqazfcbg.supabase.co/functions/v1/chat`
- Source: `supabase/functions/chat/index.ts` (Deno)
- `verify_jwt: false` — function handles its own auth (Supabase JWT or x-guest-session-id)
- Import: `npm:@supabase/supabase-js@2` (NOT esm.sh — Management API deployment requires npm: specifier)

## Deployment
- **Cannot use `supabase functions deploy` CLI** from Replit — Docker container can't reach internet
- Deploy via Management API: `PATCH https://api.supabase.com/v1/projects/{ref}/functions/{slug}` with body `{ body: "<source code>", verify_jwt: false }`
- Requires `SUPABASE_ACCESS_TOKEN` (Replit secret) — if secret is set but empty, Management API returns 401; user must reset it from Supabase Dashboard → Account → Access Tokens
- Alternative: paste source directly in Supabase Dashboard → Edge Functions → chat → Edit

## Knowledge base system (added)
- Cross-user shared KB: `engagera_knowledge_base` table in `public` schema
- Migration SQL: `supabase/migrations/20250705000000_engagera_knowledge_base.sql`
- KB functions: `normalizeKbKey`, `lookupKB`, `saveToKB`, `classifyKbQuery`, `kbTtlMs` in chat/index.ts
- Robots.txt-aware direct crawler: `isAllowedByRobots` + `fetchWebpageDirect` — falls back to Jina if blocked
- `agenticChat` now accepts `db` as first parameter (call site updated)

## Secrets in Supabase
- `OPENROUTER_API_KEY` — set via Management API `/v1/projects/{ref}/secrets`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — automatically available to all edge functions

## Frontend call
- `playground.tsx` uses `useEdgeChatCompletion` hook (`src/hooks/useEdgeChatCompletion.ts`)
- Hook calls edge function URL with Supabase session JWT (or guest session ID)
- Guest session ID stored in `sessionStorage` under `engagera_guest_id`

**Why:** OPENROUTER_API_KEY must not live in Replit env. Supabase secrets are scoped to the edge function only and never exposed to the frontend or API server.
