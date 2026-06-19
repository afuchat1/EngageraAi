---
name: Engagera web search + multi-provider routing
description: How web search works and how multi-provider fallback is architected in the chat edge function (v33+).
---

## Multi-provider fallback (v33+)

The chat function now tries 4 providers in order. If any provider fails (rate limit, network error, quota), it automatically moves to the next.

### Provider priority chains

**Standard models** (engagera-2.0, 2.1, lite, vision, voice):
1. Groq `llama-3.1-8b-instant` (20K TPM, fastest)
2. DeepSeek `deepseek-chat` (generous limits)
3. OpenRouter `meta-llama/llama-3.1-8b-instruct:free` (free, no credits)
4. Gemini `gemini-1.5-flash-latest` (Google, high limits)

**Premium models** (engagera-pro, engagera-reason):
1. Groq `llama-3.3-70b-versatile`
2. DeepSeek `deepseek-chat`
3. Gemini `gemini-1.5-pro-latest`
4. OpenRouter `deepseek/deepseek-r1:free`
5. Groq `llama-3.1-8b-instant` (last resort)

**Code model** (engagera-code):
1. Groq `llama-3.3-70b-versatile`
2. DeepSeek `deepseek-chat`
3. OpenRouter `qwen/qwen-2.5-coder-32b-instruct:free`
4. Gemini `gemini-1.5-pro-latest`
5. Groq `llama-3.1-8b-instant`

**Image gen** (SVG via chat):
1. Groq `llama-3.3-70b-versatile`
2. DeepSeek `deepseek-chat`
3. Gemini `gemini-1.5-pro-latest`

### Keys required in Supabase secrets
- `GROQ_API_KEY` — primary
- `DEEPSEEK_API_KEY` — fallback #1
- `OPENROUTER_API_KEY` — fallback #2 (free models, no credits needed)
- `GEMINI_API_KEY` — fallback #3 (different API format — handled by `callGemini()`)

### Gemini API differences
Gemini uses a completely different REST format:
- URL: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}`
- Role "assistant" → "model" in Gemini
- System message → `system_instruction.parts[0].text`
- Response → `candidates[0].content.parts[].text`
- Usage → `usageMetadata.promptTokenCount / candidatesTokenCount`
This is handled by `callGemini()` which converts to/from OpenAI message format.

## Web search architecture (v34+)

Pre-search approach (NOT tool-calling API):
1. `needsWebSearch()` — keyword regex detects real-time queries
2. `webSearch()` — returns `{ text: string, sources: Source[] }` (v34+); DuckDuckGo HTML scrape (free); Brave Search API if `BRAVE_SEARCH_API_KEY` set
3. Results injected into system message (trimmed to 2500 chars)
4. Fast chain (STANDARD_CHAIN) used for search-augmented calls
5. `searchInfo: { query, sources[] }` returned in response JSON for frontend badge + source cards

### Critical resilience rule (v35)
**Always wrap the search path in try/catch and fall back to a non-search AI call.**
DuckDuckGo may block Supabase Edge Function IPs or return no parseable results. Without this fallback, ALL search queries returned the "I'm having trouble" error even though basic chat worked fine.

`hasResults` check: only inject context if `sources.length > 0` OR text doesn't start with "No results" / "Search unavailable" / "Search failed". If search fails → fall through to `callWithFallback(chain, keys, baseConvo, ...)` silently.

### Frontend (v34)
- `WebSearchIndicator.tsx` — 🌐 badge + horizontal source cards with favicons
- `playground.tsx` — stores `searchInfo` per message in state, renders indicator above each response

## Deployment

Deploy via Supabase Management API (CLI bundler fails in Replit network):
```
node -e "const fs=require('fs'); const src=fs.readFileSync('supabase/functions/chat/index.ts','utf8'); fs.writeFileSync('/tmp/payload.json', JSON.stringify({body:src,entrypoint_path:'index.ts',import_map_path:null}));"
curl -X PATCH https://api.supabase.com/v1/projects/rhnsjqqtdzlkvqazfcbg/functions/chat \
  -H "Authorization: Bearer $SUPABASE_PAT" \
  -H "Content-Type: application/json" \
  --data-binary @/tmp/payload.json
```
