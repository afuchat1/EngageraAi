---
name: OpenRouter free model status
description: Which OpenRouter free models actually work as of June 2026, and which paid models are broken
---

OpenRouter now requires an API key even for free models. Anonymous access was removed.

**Working models (via Engagera's OPENROUTER_API_KEY, June 2026):**
- `openai/gpt-4o-mini` — confirmed working; used for ALL Engagera chat and SVG image gen
- `openai/gpt-oss-120b:free` — free tier quality model (not yet tested in edge function)
- `openai/gpt-oss-20b:free` — faster free model (not yet tested in edge function)
- `nvidia/nemotron-3-ultra-550b-a55b:free` — works for reasoning tasks (not tested in edge fn)

**Broken/exhausted (confirmed June 2026):**
- `openai/gpt-4o` — CREDITS EXHAUSTED on this OpenRouter key; returns "AI service error" (HTTP 502)
- `openai/dall-e-3` — requires paid credits, returning error (HTTP 502 via images endpoint)
- `black-forest-labs/flux-1-schnell:free` — untested via images endpoint; images API approach abandoned
- `anthropic/claude-sonnet-4-5` — unavailable on this key
- `meta-llama/llama-3.3-70b-instruct:free` — 429 from Venice upstream
- `meta-llama/llama-3.2-3b-instruct:free` — 429 from Venice upstream
- `google/gemma-4-31b-it:free` — 429 from Venice upstream
- `qwen/qwen3-coder:free` — 429 from Venice upstream
- `meta-llama/llama-3.1-8b-instruct:free` — 404 (removed)

**Current MODEL_MAP (edge function v21+):**
- ALL chat models (`engagera-2.0`, `engagera-pro`, `engagera-reason`, etc.) → `openai/gpt-4o-mini`
- `engagera-image` → `IMAGE_GEN_MODEL = openai/gpt-4o-mini` (SVG via chat completions)
- DEFAULT_MODEL → `openai/gpt-4o-mini`

**Image generation approach (v21+):**
- Uses `generateSvgImage()` which calls chat completions with `IMAGE_SYSTEM_PROMPT`
- LLM returns a ` ```svg ` code block; frontend `SvgBlock` renders it inline
- `IMAGE_GEN_MODEL = "openai/gpt-4o-mini"` (chat completions endpoint, not images endpoint)
- DALL-E 3 / images API approach ABANDONED (requires paid credits; all free alternatives failed)

**Why:** `openai/gpt-4o` credits ran out on this OpenRouter key mid-session (June 2026).
`gpt-4o-mini` is the next working model — all routes now use it.

**How to apply:** If adding new models to the model map, test via edge function first.
Always prefer `openai/gpt-4o-mini` until gpt-4o credits are replenished.
