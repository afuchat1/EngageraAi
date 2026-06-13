---
name: OpenRouter free model status
description: Which OpenRouter free models actually work as of June 2026, and which paid models are broken
---

OpenRouter now requires an API key even for free models. Anonymous access was removed.

**Working models (via Engagera's OPENROUTER_API_KEY, June 2026):**
- `openai/gpt-4o` — high quality, reliable, works with paid API key
- `openai/gpt-4o-mini` — faster/lighter, works reliably
- `openai/gpt-oss-120b:free` — best free quality
- `openai/gpt-oss-20b:free` — faster/lighter free model
- `nvidia/nemotron-3-ultra-550b-a55b:free` — works for reasoning tasks
- `nvidia/nemotron-3-super-120b-a12b:free` — works for code tasks

**Broken/unavailable (confirmed June 2026):**
- `anthropic/claude-sonnet-4-5` — returns HTTP error on this OpenRouter key (unavailable or requires credit upgrade)
- `meta-llama/llama-3.3-70b-instruct:free` — 429 from Venice upstream
- `meta-llama/llama-3.2-3b-instruct:free` — 429 from Venice upstream
- `google/gemma-4-31b-it:free` — 429 from Venice upstream
- `qwen/qwen3-coder:free` — 429 from Venice upstream
- `meta-llama/llama-3.1-8b-instruct:free` — 404 (removed)

**Current chat Edge Function model mapping:**
- `engagera-2.0` → `openai/gpt-4o`
- `engagera-2.1` → `openai/gpt-4o` (image gen enabled separately by request-detection logic)
- Legacy models → `openai/gpt-4o` or `openai/gpt-4o-mini`
- DEFAULT_MODEL → `openai/gpt-4o`

**Why:** `anthropic/claude-sonnet-4-5` failed with "AI service error" on the current OPENROUTER_API_KEY — this key can use OpenAI models but not Anthropic ones. Always use `openai/gpt-4o` as the safe default.

**How to apply:** If a new model is added to the chat Edge Function model map, test with a quick curl call first. If it returns `{"error":"AI service error"}`, switch to `openai/gpt-4o`.
