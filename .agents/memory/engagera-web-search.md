---
name: Engagera web search
description: How web search works in the chat edge function — pre-search architecture, why Groq tool-calling was abandoned, and rate limit strategy.
---

## Architecture (v32+)

Pre-search approach (NOT Groq tool-calling API):

1. `needsWebSearch()` — keyword regex patterns detect real-time queries (prices, weather, news, scores, etc.)
2. `webSearch()` — DuckDuckGo HTML scrape (free, no key); optionally Brave Search API if `BRAVE_SEARCH_API_KEY` is set
3. Results (trimmed to 2500 chars) are injected into the system message as a context block
4. Single `callGroq()` call without tools — no second round-trip
5. Fast model (`llama-3.1-8b-instant`) used when search was done to stay under the 20K TPM limit

## Why Groq tool-calling was abandoned

`llama-3.3-70b-versatile` on Groq embeds function calls in the `content` field as XML (`<function\nweb_search {...}>`) rather than returning structured `tool_calls` JSON. The second Groq call (with tool results in the conversation) hit HTTP 429 rate limits because the assembled conversation was too large for the 6,000 TPM free-tier limit.

**Why:** Groq free tier for 70b = 6,000 TPM. A pre-search conversation with system prompt + search results + user message = ~2,000 tokens. At 3 requests/minute that hits the cap.

**How to apply:** If tool-calling is needed in future, use `llama-3.1-8b-instant` (20K TPM) and keep the full conversation under 1,000 tokens.

## Rate limit model strategy

- `engagera-2.0`, `engagera-2.1`, `engagera-lite`, `engagera-vision`, `engagera-voice`, `engagera-image` → `llama-3.1-8b-instant` (20K TPM)
- `engagera-pro`, `engagera-reason`, `engagera-code` → `llama-3.3-70b-versatile` (6K TPM, premium only)
- Search-augmented calls always use `GROQ_MODEL_FAST` regardless of model requested

## Retry logic

`callGroq()` has 3 attempts with 3s/6s backoff for HTTP 429. Still fails under sustained load — user needs Groq paid plan for production volume.

## Deployment

Deploy via Supabase Management API (CLI bundler fails in Replit network):
```
curl -X PATCH https://api.supabase.com/v1/projects/rhnsjqqtdzlkvqazfcbg/functions/chat \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/payload.json
```
Build payload with Node.js `JSON.stringify` — Python not available.
