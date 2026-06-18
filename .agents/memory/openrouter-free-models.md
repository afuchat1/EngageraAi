---
name: OpenRouter vs Groq status
description: AI provider status for Engagera chat edge function; OpenRouter exhausted, Groq confirmed working
---

**Current AI provider: Groq (switched from OpenRouter, confirmed working June 2026)**

## Why Groq
OpenRouter's OPENROUTER_API_KEY on this project had all credits exhausted:
- `openai/gpt-4o` — EXHAUSTED
- `openai/gpt-4o-mini` — EXHAUSTED (appeared "confirmed working" in previous notes but also fails)
- All free `:free` suffix OpenRouter models also returning 502 (key has no free-tier access)

Groq's `GROQ_API_KEY` was already set in Supabase secrets. Groq is faster, free-tier, no credits needed.

## Groq model map (edge function v24+)
- `engagera-2.0` → `llama-3.3-70b-versatile`
- `engagera-2.1` → `llama-3.3-70b-versatile`
- `engagera-lite` → `llama-3.1-8b-instant`
- `engagera-pro`  → `llama-3.3-70b-versatile`
- `engagera-voice` → `llama-3.1-8b-instant`
- all others → `llama-3.3-70b-versatile`
- image generation → `llama-3.3-70b-versatile` (SVG via chat completions)

## Groq API
- URL: `https://api.groq.com/openai/v1/chat/completions`
- Auth: `Bearer GROQ_API_KEY` (same OpenAI-compatible format)
- Secret name in Supabase: `GROQ_API_KEY`
- Returns OpenAI-compatible JSON with `choices[0].message.content` and `usage`

## Image generation approach
- Groq generates SVG code blocks via `IMAGE_SYSTEM_PROMPT`
- Frontend `SvgBlock` renders the ` ```svg ` block inline
- No external image API calls needed

**How to apply:** If chat starts failing again, check Groq dashboard for quota. If Groq is unavailable, GEMINI_API_KEY and DEEPSEEK_API_KEY are also set in Supabase secrets as alternatives.
