---
name: AI provider status
description: Which of Engagera's 5 AI provider keys actually respond, and how that was verified.
---

As of 2026-07-10, only **Groq** is a live, responding provider for Engagera chat. Verified by deploying a temporary edge function that pinged each provider with a minimal completion request, 3 retries each:

- **Groq** — responds normally. Sole provider in all chains now (`llama-3.1-8b-instant` + `llama-3.3-70b-versatile`, separate rate-limit buckets).
- **OpenAI** — key valid but account quota exhausted (HTTP 429 "exceeded your current quota").
- **DeepSeek** — key valid but account has no funds (HTTP 402 "Insufficient Balance").
- **Gemini** — key valid (ListModels succeeds) but generation quota exhausted (HTTP 429).
- **OpenRouter** — free-tier models erroring upstream across several different `:free` model slugs (429/404/502); not usable even with retries.

**Why:** dead/exhausted keys left in the fallback chain just add latency (failed attempts before falling through) with zero benefit, and previously many free OpenRouter model slugs listed in code no longer exist/have been renamed — don't trust hardcoded free-model slugs without checking `https://openrouter.ai/api/v1/models` first.

**How to apply:** the 4 non-Groq secrets (OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY) were removed from Supabase secrets and stripped from `chat/index.ts`'s provider chains. Before re-adding any of them, re-verify with a live request first — quota/balance issues are account-side and won't self-resolve just because a key exists.

**Update 2026-07-10:** added Cloudflare Workers AI as a third fallback layer (genuinely free, no billing, generous daily quota) — needs both `CLOUDFLARE_API_TOKEN` (scoped Workers AI token) and `CLOUDFLARE_ACCOUNT_ID` as Supabase secrets. Own response shape (`data.result.response`, not OpenAI-compatible), handled via a dedicated `callCloudflare()` function. All 4 chains now: Groq model A → Groq model B → Cloudflare.
