---
name: Engagera message metadata persistence
description: Where web-search sources and time-widget info are stored so conversation history survives refresh.
---

`engagera_messages` has a `metadata jsonb` column (added 2026-07-11). The
`chat` edge function writes `{ sources, timeInfo }` into it when saving the
assistant reply (both streaming and non-streaming code paths), and the
`conversations` edge function reads it back and flattens `sources`/`timeInfo`
onto each returned message. The frontend (`landing.tsx`) maps these fields
back into `DisplayMessage` when loading conversation history.

**Why:** previously `sources` (web-search results) and `timeInfo` (real-time
clock widget) only lived in transient React state — a page refresh, or even
the very next history refetch after sending a message, silently stripped
them because the DB round-trip only carried `role`/`content`.

**How to apply:** any new transient-but-display-worthy metadata attached to
an assistant reply (e.g. future widgets) should go through this same
`metadata` jsonb column — extend the OpenAPI `ConversationMessage` schema
(`lib/api-spec/openapi.yaml`) and re-run `pnpm run codegen` in
`lib/api-spec` to regenerate the typed client — rather than keeping it
client-only.
