# Memory Index

- [Vercel import already in pnpm-workspace shape](vercel-import-already-ported.md) — some "Vercel imports" are already Vite/pnpm-workspace apps, not Next.js; check before running the full Next.js→Vite conversion.
- [Nested public/public asset bug](nested-public-dir-vite.md) — Vite only serves files directly under `public/`; a `public/public/` subfolder silently orphans assets referenced at root paths (favicon, OG image, sitemap, manifest).
- [Expo SDK upgrade procedure](expo-sdk-upgrade.md) — bump `expo` version then run `expo install --fix`; NativeTabs Icon/Label moved under `Trigger.Icon`/`Trigger.Label` in SDK 55.
- [Mobile image-gen reply recovery](mobile-image-gen-reply-recovery.md) — large single-JSON image replies can fail client-side after the server already persisted them; recover from conversation history instead of showing a false error.
- [Lab Search Engine architecture](lab-search-engine.md) — Lab tab's SearchEngine calls a Supabase `search` edge function that scrapes DuckDuckGo/Bing/YouTube/RSS (free, keyless) — no local API server, no paid search API.
- [Supabase Edge Function deploy via Management API](supabase-edge-function-deploy-api.md) — deploy edge functions from the sandbox without CLI/Docker; also covers a Bing-scraping attribute-quoting gotcha.
