---
name: Auto-reasoning two-pass AfuBot pipeline
description: How engagera-pro / engagera-auto decide whether to call AfuBot using a private reasoning pass.
---

## Models that use this pipeline
`engagera-pro` and `engagera-auto` (set `AUTO_SEARCH_MODELS` in chat/index.ts).

## Two-pass flow
**Pass 1** — send conversation + `REASONING_SYSTEM_PROMPT` → model outputs `<thinking>` + either `<answer>` or `<tool_call>`.
- `<thinking>` is stripped from all client responses; logged internally via `log("info", "auto_reason.thinking", ...)`.
- `<tool_call>` with `{"tool":"afubot","query":"..."}` → AfuBot search → **Pass 2** synthesizes final answer with search context.
- `<answer>` → returned directly (no extra LLM call, no search).

**Why:** replaces keyword-heuristic `needsWebSearch()` with model-level judgment. Fewer false-positive searches on general knowledge; smarter activation on ambiguous time-sensitive queries.

## Backward compatibility
`useAfuBot: true` in the request body still forces the old heuristic (`needsWebSearch()`) path for ALL models. Auto-reasoning only activates when `afuBotEnabled === false`.

## Cap
Max 1 AfuBot call per message. If Pass 2 produces another `<tool_call>`, it is ignored.

## Where the REASONING_SYSTEM_PROMPT lives
Inline constant in `supabase/functions/chat/index.ts`, just after `BRANDED_API_SYSTEM`. Edit there to tune Pass 1 behavior.
