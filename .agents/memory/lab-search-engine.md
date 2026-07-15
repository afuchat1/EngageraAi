---
name: Lab Search Engine architecture
description: How the Lab tab became a standalone search engine — components, edge function, and key decisions.
---

## Rule
The Lab tab is no longer a chat interface. It renders `<SearchEngine>` (artifacts/mobile/components/SearchEngine.tsx) which is completely independent of `useChatSession`. The Supabase `search` edge function (supabase/functions/search/index.ts) proxies all Brave Search API calls server-side.

**Why:** Brave Search API key lives only in Supabase env — cannot be exposed to the mobile client. All 5 search types (suggest, web, images, videos, news, finance) go through this edge function.

## How to apply
- Never route search calls directly from the mobile client to Brave.
- All 5 tab results are fetched in parallel (Promise.allSettled) when user submits a search.
- Suggestions are debounced at 150ms and fetched on every keystroke.
- Tapping any result opens `<InAppBrowser>` (artifacts/mobile/components/InAppBrowser.tsx) — a full-screen Modal with react-native-webview 13.16.0.
- The `search` edge function uses `BRAVE_SEARCH_API_KEY` (already in Supabase env — no new vars needed).
- index.tsx: mode==='lab' → SearchEngine; mode==='chat' → original chat UI.
