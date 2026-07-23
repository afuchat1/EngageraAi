---
name: Private reasoning and crawl contract
description: Rules for keeping Engagera reasoning private while exposing AfuBot progress consistently.
---

Engagera runs a private accuracy/reasoning pass before every final text answer, including answers produced after agent tools. The pass, provider details, routing, prompts, and infrastructure are never streamed or returned to callers.

**Why:** Agent-mode answers previously had a separate post-tool path that could bypass the private pass, creating inconsistent accuracy and privacy behavior.

**How to apply:** Keep AfuBot crawl progress as user-safe status events (fetching, reading, preparing) and source metadata. Keep live browsing explicitly enabled by the caller, and never use crawl/status events to expose backend implementation details.