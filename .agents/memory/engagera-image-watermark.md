---
name: Engagera image watermark
description: How AI-generated raster images get the Engagera logo watermark composited in Deno edge functions
---

Raster images from `generateRasterImage` (Cloudflare Flux Schnell, base64 JPEG) get a small
semi-transparent Engagera logo composited bottom-right before being embedded in the chat reply.

**Why:** Deno edge functions can't use native `sharp` (no native bindings support in the
Supabase edge runtime). ImageScript (`deno.land/x/imagescript`) is a pure-WASM/JS alternative
that supports decode/resize/composite/encode (PNG+JPEG, alpha) and works fine in this runtime.

**How to apply:** Logic lives in `supabase/functions/_shared/watermark.ts`, with the logo
baked in as a base64 constant in `_shared/watermark-logo.ts` (regenerate via
`convert <source>.png -resize 240x240 -strip watermark-logo.png` then base64-encode). Fails
open — returns the original image unmodified on any decode/composite error, so a bug here can't
break image generation. Only the primary raster path is watermarked; the rare SVG fallback
(used when Cloudflare's image model is unavailable) is not.

Local testing tip: `deno` isn't installed by default in this workspace — install via
`curl -fsSL https://deno.land/install.sh | sh -s -- -y` to dry-run ImageScript compositing
before deploying, since there's no other way to validate the WASM library's API locally.
