---
name: Engagera image generation
description: How engagera-image model works; why pollinations.ai was replaced with SVG generation
---

## Rule
`engagera-image` model generates images via the Supabase chat edge function, which instructs `openai/gpt-4o` to output a single `\`\`\`svg` code block. The frontend's `SvgBlock` component in `MessageContent.tsx` detects the `svg` language tag and renders it inline.

**Why:** pollinations.ai started returning HTTP 402 (Payment Required) for ALL models (flux, turbo, flux-schnell) as of June 2026, including with browser User-Agents and from Replit servers. No free tier available. The SVG approach requires zero new API keys and uses the existing OpenRouter connection.

**How to apply:**
- The `IMAGE_SYSTEM_PROMPT` constant in `supabase/functions/chat/index.ts` controls what the LLM generates.
- The model is hardcoded to `openai/gpt-4o` when `model === "engagera-image"` (better SVG quality).
- `SvgBlock` strips `<script>` and `on*` attributes before injecting innerHTML (XSS safety).
- If image quality needs improvement, update `IMAGE_SYSTEM_PROMPT` with more specific SVG instructions.
