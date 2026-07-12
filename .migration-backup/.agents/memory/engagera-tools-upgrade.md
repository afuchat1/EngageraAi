---
name: Engagera tools upgrade
description: Free-tier tool integrations added to the chat Edge Function and frontend
---

# Engagera Free-Tier Tools Upgrade

## Chat Edge Function — new tools (all live in `supabase/functions/chat/index.ts`)

### Web search: Tavily AI (primary)
- Function: `webSearch(query, tavilyKey?, braveKey?)`
- Tavily is tried first if `TAVILY_API_KEY` is set; falls back to Brave, then DuckDuckGo HTML scrape
- Tavily returns structured results with `include_answer: true`; integration at line ~725

### Deep crawl: Firecrawl (primary)
- Function: `fetchWebpage(url, firecrawlKey?)`
- Firecrawl `/v1/scrape` with `formats: ["markdown"], onlyMainContent: true` tried first
- Falls back to Jina AI Reader (free, no key)
- `fetchWebpageDirect(url, requestId, firecrawlKey?)` also updated to pass key through

### Weather tool (wttr.in — no key needed)
- Functions: `detectWeatherQuery(text)` → location string, `fetchWeather(location, requestId)`
- Detects patterns like "weather in Lagos", "forecast for London", etc.
- Returns temp °C/°F, humidity, wind, UV, sunrise/sunset, 3-day forecast
- Returns early from agenticChat if weather data found

### Currency tool (Frankfurter ECB + Open ER — no key needed)
- Functions: `detectCurrencyQuery(text)` → `CurrencyQuery`, `fetchCurrencyRate(q, requestId)`
- Detects patterns like "100 USD to NGN", "convert 50 euros to pounds", "EUR to GBP rate"
- Primary: Frankfurter (ECB rates, 30+ currencies); fallback: Open ER API
- Returns early from agenticChat if rate data found

### Secrets stored in Supabase
- `TAVILY_API_KEY` — set 2026-07-11
- `FIRECRAWL_API_KEY` — set 2026-07-11

**Why:** Free-for.dev services; Tavily is specifically designed for AI agent search (vs DuckDuckGo scraping); Firecrawl gives cleaner markdown than Jina.

## Frontend upgrades

### PostHog analytics (`artifacts/engagera/src/lib/analytics.ts`)
- `initAnalytics()` — call once at app boot (idempotent)
- `identifyUser(userId, email?)` — called on auth state change
- `resetUser()` — called on sign-out
- `trackEvent(event, properties?)` — general event tracking
- Initialized in `App.tsx` inside the boot `useEffect`
- PostHog key: `phx_ESy9...` — note: this is a personal API key format (phx_), not a project key (phc_). May need to be updated with a proper project key.

### Streak badge (`artifacts/engagera/src/components/StreakBadge.tsx`)
- Reads from `engagera_usage_records` (already populated), no new table needed
- Calculates current streak, longest streak, total active days
- Shows flame emoji (colour-coded: orange ≥14d, yellow ≥7d, amber ≥3d)
- Rendered at top of dashboard page

## Deployment
- SUPABASE_ACCESS_TOKEN saved as Replit secret
- Deploy command: `SUPABASE_ACCESS_TOKEN=... supabase functions deploy chat --project-ref rhnsjqqtdzlkvqazfcbg --use-api --no-verify-jwt`
