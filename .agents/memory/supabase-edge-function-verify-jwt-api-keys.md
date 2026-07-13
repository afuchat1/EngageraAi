---
name: Supabase edge function verify_jwt vs custom API keys
description: Why edge functions implementing their own API-key auth (e.g. eng_... keys) must have verify_jwt disabled at the Supabase project level, not just in function code.
---

Supabase's gateway enforces its own JWT check in front of every edge function when `verify_jwt` is `true` for that function (the project default). This check runs *before* the function's own code, so a function that implements custom bearer-token schemes (API keys not shaped like a Supabase JWT) will 401 with `UNAUTHORIZED_INVALID_JWT_FORMAT` for every caller using that scheme, no matter how correct the in-function auth logic is.

**Why:** the gateway can't tell a custom API key from a malformed JWT — it just checks JWT format/signature and rejects anything that doesn't parse, before the function ever sees the request.

**How to apply:** for any edge function meant to accept a non-JWT credential (e.g. a `eng_...`-style API key checked in code, or a custom header), disable `verify_jwt` for that specific function via the Supabase Management API (`PATCH /v1/projects/{ref}/functions/{slug}` with `{"verify_jwt": false}`) or dashboard — the function's own code must still perform its own auth check, since disabling verify_jwt makes the endpoint reachable by anyone. Check sibling functions in the same project for the same pattern (e.g. an `api-keys` function already set to `verify_jwt: false` is a strong signal this is the intended design for that codebase). Requires a Supabase personal access token (Management API scope) — request via `requestSecrets`, never accept it pasted in chat.
