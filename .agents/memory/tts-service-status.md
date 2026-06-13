---
name: TTS service status
description: Status of TTS services for the Engagera phone-call voice feature as of June 2026
---

# TTS Service Status (June 2026)

## ElevenLabs (BROKEN — free tier disabled)
- HTTP 402, message: "Unusual activity has been detected on your account, so Free Tier access has been disabled."
- Triggered by VPN/proxy detection (Supabase Deno Deploy IP flagged)
- Cannot recover without upgrading to paid plan

## OpenAI TTS — `/v1/audio/speech` (BROKEN — quota exceeded)
- HTTP 429, `insufficient_quota` error
- The `OPENAI_API_KEY` in Supabase secrets has no credit balance

## Current TTS Solution (usePhoneVoice.ts)
- **Primary**: browser `SpeechSynthesisUtterance` — always works, zero cost, instant
- **Fast-fail**: tries `elevenlabs-tts` Edge Function first (which internally calls OpenAI TTS)
  with a 3-second AbortController timeout. After the first failure, `ttsAvailableRef.current`
  is set to `false` and subsequent calls skip the Edge Function entirely (no wasted latency)
- Preferred voices: Microsoft Aria Online, Microsoft Jenny Online, Samantha, Karen, Google UK English Female

## Restoring high-quality TTS
When a working TTS API is available, update `supabase/functions/elevenlabs-tts/index.ts`:
- The function already uses OpenAI TTS format — just add credit to the OpenAI key
- OR update to a different provider (Unreal Speech free tier: 250K chars/month)
- No frontend hook changes needed — the fast-fail will self-heal once the Edge Function returns 200

**Why:** Both ElevenLabs and OpenAI TTS were unavailable simultaneously (June 2026).
Browser SpeechSynthesis is the reliable zero-dependency fallback that always works
across all browsers and environments.
