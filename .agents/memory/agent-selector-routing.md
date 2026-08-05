---
name: Agent selector and routing
description: How the 8-agent selector works in landing.tsx and how agents are routed in the chat edge function.
---

## Rule
The agent selector chip above the textarea lets users switch between 8 specialized agents. The selected agent is passed to the edge function which augments the system prompt accordingly.

**Why:** The Engagera platform spec calls for 9 named agents (assistant, research, planner, coding, writing, data, document, automation, memory). Memory agent is defined but not in the UI selector (8 visible ones).

## Frontend (artifacts/engagera/src/pages/landing.tsx)
- `AGENTS` constant array defines 8 agents with `id`, `label`, `icon`, `description`
- `selectedAgent` state (default: `"assistant"`)
- Agent dropdown menu with `showAgentMenu` boolean; click-away via `useEffect` + `agentMenuRef`
- `agent: selectedAgent !== "assistant" ? selectedAgent : undefined` passed to `streamEdgeChat`
- Textarea placeholder changes to match selected agent name

## Hook (useEdgeChatCompletion.ts)
- `ChatRequest` has `agent?: string` field — passed straight through to the fetch body JSON

## Edge function (supabase/functions/chat/index.ts)
- Body type includes `agent?: string`, destructured as `agentId`
- `shouldSearch` condition: `agentId === "research"` forces web search regardless of afuBotEnabled
- `AGENT_AUGMENTS` record keyed by agentId, appended to systemPrompt after `buildSystemPrompt()`
- "assistant" agent gets no augmentation — uses the base system prompt

**How to apply:** To add a new agent, add an entry to `AGENTS` in landing.tsx and a matching entry in `AGENT_AUGMENTS` in the edge function. No other changes needed.
