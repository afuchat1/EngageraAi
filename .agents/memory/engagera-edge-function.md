---
name: Engagera edge function
description: Chat AI calls go through a Supabase Edge Function; OPENROUTER_API_KEY stored as Supabase secret only; AI identity system prompt injected
---

# Engagera Edge Function Architecture

## What changed
- Chat completions moved from Express `/api/chat` route → Supabase Edge Function `chat`
- `OPENROUTER_API_KEY` is now a **Supabase secret** (not a Replit env var)
- Express API server still handles: `/api/models`, `/api/api-keys`, `/api/conversations`, `/api/usage`, `/api/dashboard`

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
- Requires `SUPABASE_ACCESS_TOKEN` (Replit secret)

## Secrets in Supabase
- `OPENROUTER_API_KEY` — set via Management API `/v1/projects/{ref}/secrets`
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — automatically available to all edge functions

## Frontend call
- `playground.tsx` uses `useEdgeChatCompletion` hook (`src/hooks/useEdgeChatCompletion.ts`)
- Hook calls edge function URL with Supabase session JWT (or guest session ID)
- Guest session ID stored in `sessionStorage` under `engagera_guest_id`

**Why:** OPENROUTER_API_KEY must not live in Replit env. Supabase secrets are scoped to the edge function only and never exposed to the frontend or API server.
