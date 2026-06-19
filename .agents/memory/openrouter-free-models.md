---
name: OpenRouter vs Groq status
description: AI provider status for Engagera chat edge function; OpenRouter exhausted, Groq confirmed working with rate limit notes
---

**Current AI provider: Groq (switched from OpenRouter, confirmed working June 2026)**

## Why Groq
OpenRouter's OPENROUTER_API_KEY on this project had all credits exhausted. Groq's `GROQ_API_KEY` was already set in Supabase secrets. Groq is faster, free-tier, no credits needed.

## Groq model map (edge function v32+)
Rate limit strategy: use llama-3.1-8b-instant (20K TPM) for standard models, llama-3.3-70b-versatile (6K TPM) only for premium.

- `engagera-2.0` → `llama-3.1-8b-instant` (20K TPM)
- `engagera-2.1` → `llama-3.1-8b-instant`
- `engagera-lite` → `llama-3.1-8b-instant`
- `engagera-pro`  → `llama-3.3-70b-versatile` (premium)
- `engagera-reason` → `llama-3.3-70b-versatile` (premium)
- `engagera-code` → `llama-3.3-70b-versatile` (premium)
- `engagera-vision` → `llama-3.1-8b-instant`
- `engagera-voice` → `llama-3.1-8b-instant`
- `engagera-image` → `llama-3.1-8b-instant` (SVG via chat completions)
- Search-augmented calls → always `llama-3.1-8b-instant` regardless of model

## Groq API
- URL: `https://api.groq.com/openai/v1/chat/completions`
- Auth: `Bearer GROQ_API_KEY`
- Secret name in Supabase: `GROQ_API_KEY`
- Free-tier limits: llama-3.3-70b = 6,000 TPM; llama-3.1-8b = 20,000 TPM

## callGroq retry logic
3 attempts with 3s/6s backoff for HTTP 429. Still fails under sustained production load — needs Groq paid plan for high volume.

**How to apply:** If chat starts failing again, check Groq dashboard for quota. If Groq is unavailable, GEMINI_API_KEY and DEEPSEEK_API_KEY are also set in Supabase secrets as alternatives.
