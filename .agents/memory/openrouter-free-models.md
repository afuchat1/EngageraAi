---
name: OpenRouter free model status
description: Which OpenRouter free models actually work as of June 2026
---

OpenRouter now requires an API key even for free models. Anonymous access was removed.

**Working models (June 2026):**
- `openai/gpt-oss-120b:free` — best quality, used for engagera-pro and engagera-vision
- `openai/gpt-oss-20b:free` — faster/lighter, used for engagera-lite and engagera-voice
- `nvidia/nemotron-3-ultra-550b-a55b:free` — used for engagera-reason
- `nvidia/nemotron-3-super-120b-a12b:free` — used for engagera-code

**Not working (Venice rate-limited):**
- `meta-llama/llama-3.3-70b-instruct:free` — 429 from Venice upstream
- `meta-llama/llama-3.2-3b-instruct:free` — 429 from Venice upstream
- `google/gemma-4-31b-it:free` — 429 from Venice upstream
- `qwen/qwen3-coder:free` — 429 from Venice upstream
- `meta-llama/llama-3.1-8b-instruct:free` — 404 (removed)

**Why:** Venice is the upstream provider for many free Llama/Gemma/Qwen models on OpenRouter. They throttle heavily. NVIDIA-hosted and OpenAI OSS models have separate capacity.

**How to apply:** Check `artifacts/api-server/src/lib/aiRouter.ts`. To find currently working models, hit `GET https://openrouter.ai/api/v1/models` and test each `:free` model with a quick chat call. Venice-based providers will 429 immediately.
