# Memory Index

- [Vercel import already in pnpm-workspace shape](vercel-import-already-ported.md) — some "Vercel imports" are already Vite/pnpm-workspace apps, not Next.js; check before running the full Next.js→Vite conversion.
- [Nested public/public asset bug](nested-public-dir-vite.md) — Vite only serves files directly under `public/`; a `public/public/` subfolder silently orphans assets referenced at root paths (favicon, OG image, sitemap, manifest).
- [Expo SDK upgrade procedure](expo-sdk-upgrade.md) — bump `expo` version then run `expo install --fix`; NativeTabs Icon/Label moved under `Trigger.Icon`/`Trigger.Label` in SDK 55.
- [Mobile image-gen reply recovery](mobile-image-gen-reply-recovery.md) — large single-JSON image replies can fail client-side after the server already persisted them; recover from conversation history instead of showing a false error.
- [Lab Search Engine architecture](lab-search-engine.md) — Lab tab's SearchEngine calls a Supabase `search` edge function that scrapes DuckDuckGo/Bing/YouTube/RSS (free, keyless) — no local API server, no paid search API.
- [Supabase Edge Function deploy via Management API](supabase-edge-function-deploy-api.md) — deploy edge functions from the sandbox without CLI/Docker; also covers a Bing-scraping attribute-quoting gotcha.
- [Chat edge function boot error fix](chat-edge-boot-error.md) — toLocaleString(locale) at module init + static WASM imports cause 503 BOOT_ERROR in Supabase Deno runtime; fix: move date strings inside handler, remove WASM static imports.
- [Imported artifact workflow wiring](imported-artifact-workflow.md) — an imported Vite artifact may have artifact metadata but no registered managed workflow; use its existing command and actual Vite port.
- [Reasoning and AfuBot boundary](reasoning-afubot-separation.md) — chat reasoning is private and AfuBot live crawling is an explicit opt-in capability, never an implicit chat dependency.
- [Private reasoning and crawl contract](private-reasoning-and-crawl-contract.md) — every final text answer, including post-tool answers, uses private reasoning; expose only safe crawl progress and sources.
- [API and platform product boundary](api-platform-boundary.md) — API keys must bypass Supabase JWT gating and never inherit platform memories, settings, documents, or chat history.
- [Auto-reasoning two-pass AfuBot pipeline](auto-reasoning-two-pass.md) — engagera-pro/engagera-auto use Pass 1 reasoning to decide if AfuBot is needed; <thinking> stripped from all client output.
- [SDK agent platform upgrade](sdk-agent-platform.md) — SDK bumped 0.1.5→0.2.0 with agents/memory/workflows resources; Memory_ class exported as MemoryResource to avoid name collision with Memory type.
- [Inline source favicon injection](inline-source-favicons.md) — inject favicons into paragraph/li text nodes via buildSourceNameMap+processChildrenWithFavicons; processes string children only, leaves React elements untouched.
- [Agent selector and routing](agent-selector-routing.md) — 8-agent selector chip (AGENTS array) in landing.tsx above textarea; agent passed to edge fn; research agent forces afuBotEnabled; system prompt augmented per agentId in AGENT_AUGMENTS map.
