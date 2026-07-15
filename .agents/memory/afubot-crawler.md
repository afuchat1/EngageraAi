---
name: AfuBot own-crawler search
description: Engagera's Lab/search feature is a self-built crawler, not a third-party search proxy — key constraints for extending it.
---

Engagera's "Lab" search (mobile app) is powered by `artifacts/api-server/src/lib/afubot/` — a
hand-rolled spider (own User-Agent, regex HTML parsing, seed-site directory, one-hop link
following, own TF-style scoring). It does not call Bing/Google/Brave/DuckDuckGo or any other
search API. News comes from outlets' own official RSS feeds (fetched directly), not a news
aggregator. Finance falls back to crawled web/news content about the company — no live quote
provider is wired in.

**Why:** the user explicitly required a real built crawler, not a third-party-search proxy
under new branding, and required that nothing ever link out to an external browser.

**How to apply:**
- Free stock-quote APIs without a key are unreliable: Stooq's `/q/l/` live-quote CSV endpoint
  returns 404 (deprecated/geo-blocked), its `/q/d/l/` historical endpoint serves a JS bot-challenge,
  and Yahoo's `query1.finance.yahoo.com/v7/finance/quote` returns 401 Unauthorized without a
  registered app. Don't re-attempt these without a real API key/integration; the honest fallback
  is crawled context, not a fabricated quote.
- All outbound links in the mobile app must open in the app's own `InAppBrowser` component
  (WebView-based) — never `Linking.openURL` or `expo-web-browser`'s `openBrowserAsync`. Check
  both when adding new tappable links.
- The mobile Lab search bar is bottom-anchored (mirrors `ChatInput.tsx`'s pill style), not
  top-anchored — suggestions render as a floating panel above the input, not a top dropdown.
- Bare-domain input (e.g. "afuchat.com") is detected via `looksLikeDomain()` in
  `crawler.ts` and opened directly in `InAppBrowser`, skipping search entirely. The regex must
  match single-dot domains too (`word.tld`), not just multi-dot ones.
