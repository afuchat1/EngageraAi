---
name: Engagera guest access
description: How unauthenticated (guest) users access the chat API and how rate limiting works
---

Guests can chat without signing in, limited to 5 messages per session.

**Session ID:** Generated client-side via `crypto.randomUUID()`, stored in `localStorage` key `engagera_guest_session_id`. Sent on every API call via the `x-guest-session-id` header.

**Header injection:** `setGuestSessionId(id)` in `lib/api-client-react/src/custom-fetch.ts` (like `setAuthTokenGetter`). Called from `landing.tsx` in a `useEffect` when user is not authenticated. Automatically clears when user signs in.

**Rate limiting:** Tracked in `public.engagera_guest_sessions`. Limit is `GUEST_GUEST_MESSAGE_LIMIT = 5` in `artifacts/api-server/src/routes/chat.ts`. Returns HTTP 429 with `{ error: "GUEST_LIMIT_REACHED", guestMessageCount, guestMessageLimit }` when exceeded.

**Why:** Allows visitors to experience the product before sign-up, reducing friction while controlling costs.

**How to apply:** The `optionalAuth` middleware in `artifacts/api-server/src/middlewares/optionalAuth.ts` resolves either `req.userId` (JWT) or `req.guestSessionId` (header). Routes that support both use `optionalAuth`; routes that require sign-in use `requireAuth`.
