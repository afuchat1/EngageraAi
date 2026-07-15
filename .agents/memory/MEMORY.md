# Memory Index

- [Vercel import already in pnpm-workspace shape](vercel-import-already-ported.md) — some "Vercel imports" are already Vite/pnpm-workspace apps, not Next.js; check before running the full Next.js→Vite conversion.
- [Nested public/public asset bug](nested-public-dir-vite.md) — Vite only serves files directly under `public/`; a `public/public/` subfolder silently orphans assets referenced at root paths (favicon, OG image, sitemap, manifest).
- [Expo SDK upgrade procedure](expo-sdk-upgrade.md) — bump `expo` version then run `expo install --fix`; NativeTabs Icon/Label moved under `Trigger.Icon`/`Trigger.Label` in SDK 55.
