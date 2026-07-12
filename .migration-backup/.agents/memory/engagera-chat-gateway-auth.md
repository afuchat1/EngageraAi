---
name: Engagera chat function gateway auth
description: Supabase gateway verify_jwt setting must stay false on the chat function or all eng_ API key calls 401
---

The `chat` edge function has its own complete `eng_...` API-key auth logic, but the Supabase
**gateway** in front of it also has a `verify_jwt` setting. If that's `true`, the gateway
rejects any request whose Bearer token isn't a real Supabase JWT — including every legitimate
`eng_` key — with a generic 401, before the function code ever runs.

**Why:** This is easy to regress: redeploying via `supabase functions deploy chat` without
`--no-verify-jwt` can silently flip it back to `true` and reintroduce mass 401s for every
external dev using the documented direct-key auth flow.

**How to apply:** Always deploy this function with
`supabase functions deploy chat --project-ref <ref> --use-api --no-verify-jwt`. Verify via the
Supabase Management API (`GET /v1/projects/{ref}/functions`) that `verify_jwt` is `false`
for `chat` after any deploy touching it.

Also: the live `/chat` response uses camelCase usage fields (`inputTokens`/`outputTokens`/
`totalTokens`), not snake_case — docs had drifted from actual behavior here; verify docs against
a real response (not just source) when auditing.
