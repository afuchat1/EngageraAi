---
name: Supabase Edge Function deployment in Replit
description: How to deploy Supabase Edge Functions from Replit (Docker bundling is blocked by network firewall)
---

# Supabase Edge Function deployment in Replit

## Rule
Always use `--use-api` when deploying Edge Functions from Replit. Never rely on `--use-docker` (default).

**Why:** Replit's network firewall blocks outbound requests to package registries that the Docker bundler needs. `--use-api` uploads source files directly to Supabase, which bundles server-side.

**How to apply:**
```bash
supabase functions deploy <slug> --use-api
supabase functions deploy chat --no-verify-jwt --use-api  # chat uses no-verify-jwt
```

## Project details
- Project ref: rhnsjqqtdzlkvqazfcbg
- 8 functions live: chat, api-keys, conversations, dashboard, models, usage, stt, elevenlabs-tts, send-reset-email
- chat is deployed with --no-verify-jwt so Edge Function handles all auth itself

## Auth via CLI
`supabase login --token <pat>` then `supabase link --project-ref rhnsjqqtdzlkvqazfcbg`
