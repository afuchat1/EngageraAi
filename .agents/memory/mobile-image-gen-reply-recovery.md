---
name: Mobile image-gen reply recovery
description: Why a generated image can show "Something went wrong" on mobile even though it was saved server-side, and how the client recovers it.
---

Engagera's chat edge function returns image-generation replies as a single large JSON body (a full base64 JPEG, not streamed token-by-token). On a slow/flaky mobile connection, the client's fetch/JSON-parse of that big body can fail (abort, network error, truncated parse) *after* the backend has already generated and persisted the assistant message to `engagera_messages`. The user sees a false "Something went wrong" error, but the real reply is already sitting in the conversation on the server — reopening the conversation shows it correctly.

**Why:** persistence happens server-side before/while the response is sent; only the client's local receipt of the (large) response is unreliable, not the generation or save.

**How to apply:** `artifacts/mobile/hooks/useChatSession.ts`'s catch block now calls `tryRecoverPersistedReply()` (fetches `listConversations`/`fetchConversationMessages` from `lib/conversations.ts`) whenever an image-gen request throws a non-rate-limit error, and uses the already-saved assistant message instead of showing a false error. If a similar large-single-JSON-body pattern is added elsewhere (web app's `useEdgeChatCompletion.ts` has the identical architecture and is equally exposed), apply the same recovery pattern rather than just upping the timeout.
