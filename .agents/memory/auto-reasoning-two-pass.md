---
name: Auto-reasoning two-pass AfuBot pipeline
description: How engagera-pro / engagera-auto follow the visible research protocol and decide whether to call AfuBot.
---

## Models that use this pipeline
`engagera-pro` and `engagera-auto` (set `AUTO_SEARCH_MODELS` in chat/index.ts).

## Two-pass flow
**Pass 1** — send conversation + `DEEP_RESEARCH_SYSTEM` prompt → model outputs a visible `<research_plan>` block + either `<answer>` or `<tool_call>`.
- `<research_plan>` is ALWAYS forwarded to the client (user can see it).
- `<tool_call>` with `{"tool":"afubot","query":"..."}` → AfuBot search → **Pass 2** synthesizes final answer with search context.
- `<answer>` → returned directly with `<research_plan>` prepended (no extra LLM call, no search).

**Pass 2 composition (when search runs):**
Server composes the final content as:
```
<research_plan>
...plan text...
</research_plan>

<sources>
[1] Title: ... | URL: ... | Key fact: ...
[2] Title: ... | URL: ...
</sources>

[Pass 2 LLM answer with [1],[2] citations]
```

## Safety net (critical)
Models sometimes output "SEARCH" in the plan's Action line but forget to emit `<tool_call>`. The safety net in `runAutoReasoningPass1` checks:
- If `<research_plan>` Action line contains "search" (case-insensitive) but no `<tool_call>` was emitted → force AfuBot using the user's last message as the query.

## Confidence threshold
**8/10** — built into `DEEP_RESEARCH_SYSTEM`. Any answer below 8/10 confidence triggers AfuBot. "who is [name]" queries ALWAYS trigger AfuBot (identity hallucination risk).

## Backward compatibility
`useAfuBot: true` in the request body still forces the old heuristic (`needsWebSearch()`) path for ALL models. Auto-reasoning only activates when `afuBotEnabled === false`.

## Where the DEEP_RESEARCH_SYSTEM prompt lives
Inline constant in `supabase/functions/chat/index.ts`, just after `BRANDED_API_SYSTEM`. Edit there to tune Pass 1 behavior.

## Known limitation
DuckDuckGo HTML scraper can return 0 results for certain person/entity queries due to rate-limiting or captcha. When this happens, Pass 2 runs with empty search context and answers from training data. The `<research_plan>` still shows correctly. This is a free-scraping infrastructure constraint, not a logic bug.
