---
name: Engagera product decisions
description: User-driven product decisions about scope (Playground removal) and API contract (developer system prompts).
---

- **Playground removed (2026-07-11):** the user asked to keep only one chat
  interface (on the landing/home page) and drop the separate Playground page
  entirely. Removed `pages/playground.tsx`, its route in `App.tsx`, and its
  nav entry in `AppLayout.tsx`'s `NAV_ITEMS`, plus stray "Playground" text
  in `pages/docs.tsx`. If a future request re-introduces a distinct testing
  surface, confirm with the user first — this was an explicit simplification,
  not an oversight.

- **Developer system prompts (API contract):** `supabase/functions/chat/index.ts`
  already correctly honors a caller-supplied `role: "system"` message in the
  `messages` array **only** when the request is authenticated via an `eng_`
  API key (`apiKeyId` is set) — in that case the developer's system message
  fully replaces the built-in Engagera persona (`SYSTEM_PROMPT`), in both the
  streaming and non-streaming code paths. Guest/JWT (web UI) requests always
  get the Engagera persona regardless of any system message in the payload.
  The Express `api-server` proxy (`routes/chat.ts` → `lib/proxy.ts`) forwards
  the full `messages` array unchanged, so this works end-to-end through the
  public REST API too. Note: the proxy currently does *not* forward `stream`
  or `generateImage` fields from the request body — only `messages`, `model`,
  `conversationId`, `contextHint` — a latent gap if streaming/image-gen via
  the public API is ever requested.
