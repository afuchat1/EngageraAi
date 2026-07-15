---
name: Lab Search Engine architecture
description: How the Lab tab's search engine works — components, edge function, and source strategy (no local backend, no paid API).
---

## Rule
The Lab tab renders `<SearchEngine>` (`artifacts/mobile/components/SearchEngine.tsx`), completely independent of `useChatSession`. It calls the Supabase `search` edge function (`supabase/functions/search/index.ts`, logic in `supabase/functions/_shared/search.ts`) directly — there is no local API server anywhere in this workspace (an earlier `artifacts/api-server` Express app that hosted a hand-rolled crawler was removed).

**Why:** per explicit product decision, all backend logic must go through Supabase Edge Functions — no locally-run backend service. The search sources also had to be free/keyless (no paid search API budget), which ruled out Brave Search API (an earlier version of this function proxied Brave; that key/approach is gone).

## Current source strategy (all free, no API key)
- **Web**: DuckDuckGo HTML search (`html.duckduckgo.com/html`), scraped with regex.
- **Suggestions**: DuckDuckGo autocomplete (`duckduckgo.com/ac/?q=...&type=list`) — response shape is `[query, [suggestion strings]]`, not `[{phrase}]`.
- **Images**: Bing image search HTML — result cards are `<a class="iusc" ... m="{...}">` with the JSON in a **double-quoted, HTML-entity-encoded** `m` attribute (not single-quoted); must decode entities before `JSON.parse`.
- **Videos**: YouTube search HTML — extract the embedded `ytInitialData` JSON blob and walk it for `videoRenderer` nodes.
- **News**: merges Bing News RSS + Google News RSS (both query-scoped) with a curated list of outlets' own official RSS feeds (BBC, NPR, Al Jazeera, TechCrunch, The Verge, ESPN, NASA), deduped and ranked by keyword overlap with the query.
- **Finance**: reuses the news pipeline with a "<query> stock" modifier, plus DuckDuckGo web results for "<query> stock price market". No live quote provider (see gotcha below).
- **Resolve** (bare-domain detection, e.g. "afuchat.com"): pure regex, no network call.

## Engagera AI tab
The Lab search results also have an "AI" tab (Engagera AI overview) that calls the `chat` edge function
directly (model `engagera-2.1`/`LAB_MODEL`, `stream:false`, a `contextHint` describing it's a search-page
overview) instead of the `search` edge function. It is fetched **lazily** — only when the user opens that
tab for the current query — not alongside the other four tabs on every search.

**Why:** the `chat` function meters usage against the same guest-message quota (5 free messages) as the
Chat tab. Firing it automatically on every Lab search would silently burn a user's chat quota just for
looking at search results.

**How to apply:** any future Lab tab that goes through `chat` (as opposed to the keyless `search` function)
must follow the same lazy/on-open fetch pattern, gated on the tab actually being viewed.

## How to apply
- Never route search calls directly from the mobile client to a third party — always through the `search` edge function (mirrors `lib/chat.ts`'s auth pattern: bearer session token or anon key, `x-guest-session-id` header when unauthenticated).
- All scraping fetches must have a timeout and fail soft to `[]`/`null` — never fabricate a result if a source's HTML layout changes or a request is blocked.
- Tapping any result opens `<InAppBrowser>` (`artifacts/mobile/components/InAppBrowser.tsx`) — a full-screen Modal with `react-native-webview`. Never open results in an external browser (`Linking.openURL`/`expo-web-browser`).
- Free stock-quote APIs without a key are unreliable: Stooq's `/q/l/` endpoint 404s (deprecated/geo-blocked), `/q/d/l/` serves a JS bot-challenge, and Yahoo's `query1.finance.yahoo.com/v7/finance/quote` 401s without a registered app. Don't re-attempt these without a real API key/integration.
- Edge functions can be deployed from the workspace sandbox via the Supabase Management API — see the deploy-via-management-API memory topic for the exact multipart request shape (needed for any future change to `supabase/functions/search/`).
