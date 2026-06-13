---
name: Engagera Vercel deployment
description: How Engagera is configured for Vercel deployment — vercel.json, API adapter, env vars required
---

# Engagera Vercel Deployment

## Files
- `vercel.json` — root-level Vercel config
- `api/index.ts` — Express adapter (exports Express app as Vercel serverless handler)
- `.env.example` — documents all required env vars

## Architecture on Vercel
- Frontend (`/*`): React SPA served from `artifacts/engagera/dist/public` (built by Vite during Vercel build)
- Backend (`/api/*`): Express app running as a Vercel serverless function (`api/index.ts`)
- Chat AI: Supabase Edge Function (independent of Vercel)

## Build command on Vercel
`pnpm install && pnpm --filter @workspace/engagera run build`

Output directory: `artifacts/engagera/dist/public`

## Required Vercel Environment Variables (set in Vercel dashboard)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `VITE_SUPABASE_URL` (build-time — must be set before first deploy)
- `VITE_SUPABASE_ANON_KEY` (build-time — must be set before first deploy)
- `OPENROUTER_API_KEY` (for Express `/api/chat` route)

## Key behaviors
- `app.ts` checks `process.env.VERCEL` — skips static file serving on Vercel (CDN handles it)
- `vercel.json` rewrites `/api/:path*` → `api/index.ts` serverless function
- `vercel.json` rewrites `/*` → `/index.html` for SPA routing

**Why:** Vercel serves static files from CDN; Express only needs to handle API routes. If VERCEL env var wasn't checked, Express would try to serve non-existent static files in production.
