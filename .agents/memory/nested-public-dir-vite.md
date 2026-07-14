---
name: Nested public/public asset bug in Vite artifacts
description: Vite artifacts sometimes end up with a stray public/public/ subfolder holding the "real" static assets, which are never actually served, breaking OG images, manifest, sitemap, robots.txt.
---

Vite's `publicDir` (default `public/`) copies its *contents* to the site root at build/serve time — anything nested one level deeper, e.g. `public/public/logo.png`, is served at `/public/logo.png`, not `/logo.png`. If `index.html` or a manifest references root-relative paths like `/logo.png`, `/opengraph.jpg`, `/sitemap.xml`, those requests 404 even though the files exist on disk.

**Why:** Found in an imported project where a thorough, well-written SEO setup (OG image, JSON-LD, site.webmanifest, sitemap.xml, detailed robots.txt) was completely inert because every one of those files lived in `public/public/` instead of `public/`. Only a bare `favicon.png` and minimal `robots.txt` sitting directly in `public/` were actually being served — everything else silently failed with no build error.

**How to apply:** When auditing or adding SEO/static assets in any Vite (or similar `publicDir`-based) project, check for a nested `public/<publicDirName>/` folder. If found, move its contents up one level and delete the empty nested folder, then verify with `curl` that each root-relative path referenced in `index.html`/manifest actually returns 200.
