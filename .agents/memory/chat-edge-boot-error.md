---
name: Engagera chat edge function boot error root cause
description: Why the Supabase chat edge function was returning 503 BOOT_ERROR and how it was fixed
---

## Root Cause

The `chat` edge function (and all its historical variants) returned `{"code":"BOOT_ERROR"}` because of **two combined problems** in the original 3509-line function:

1. **`toLocaleString("en-GB", {...})` / `toLocaleDateString("en-GB", {...})` in top-level template literals**: The SYSTEM_PROMPT and ENGAGERA_DEV_SYSTEM_PROMPT were `const` declarations at module scope containing `${new Date().toLocaleString("en-GB", { weekday:"long", ... })}`. Supabase's Deno runtime does NOT include full ICU locale data — this throws `RangeError` at module init, crashing the isolate before `Deno.serve()` is ever called.

2. **Static WASM imports at module level**: `imagescript` (via `_shared/watermark.ts`) and `deno_dom` were statically imported — their WASM binaries are instantiated synchronously during cold start, pushing the runtime over its boot-time resource limit.

**Neither fix alone was sufficient** — the function needed both fixes applied together.

## Fix Applied

Rewrote `supabase/functions/chat/index.ts` as a clean ~400-line function:
- NO static WASM imports (no imagescript, no deno_dom)
- System prompt date built INSIDE the request handler (not at module init)
- Same provider chain: Groq → Cerebras → Cloudflare Workers AI
- Same auth paths: API key, JWT, guest session with rate limiting
- DuckDuckGo scraping for web search (no WASM DOM parser needed)
- Conversation persistence to engagera_conversations/engagera_messages

## Rules

**Never** put `new Date().toLocaleString(locale, {...})` in a top-level `const` template literal in a Supabase edge function. Always compute date strings inside `Deno.serve()`.

**Never** statically import WASM modules at the top of a Supabase edge function. Use dynamic `await import(...)` inside the handler, or avoid WASM entirely.
