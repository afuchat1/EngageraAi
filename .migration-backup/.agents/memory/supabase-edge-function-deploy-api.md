---
name: Supabase Edge Function deploy via Management API
description: How to deploy/update a Supabase Edge Function (multi-file, with _shared imports) using the Management API instead of the CLI/Docker.
---

## Endpoint
`POST https://api.supabase.com/v1/projects/{project-ref}/functions/deploy?slug={slug}`
Auth: `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` (a personal access token, not the anon/service key).
Body: `multipart/form-data` with:
- one `metadata` field: JSON string, at least `{ "entrypoint_path": "index.ts", "name": "<slug>", "verify_jwt": true }`
- one or more `file` fields, each `file=@localpath;filename=<relative-path>`

**Why:** This lets an agent without Docker/CLI access deploy edge functions directly from the workspace.

## Multi-file functions (shared imports)
If the function imports a sibling module (e.g. `import ... from "../_shared/watermark.ts"`), upload it as an
additional `file` part whose `filename` preserves that same relative path from the entrypoint's perspective
(e.g. `filename=../_shared/watermark.ts`). The entrypoint itself is uploaded as `filename=index.ts` and
referenced by `entrypoint_path` in the metadata JSON. Confirmed working (HTTP 201, `status: "ACTIVE"`) for a
function importing two `_shared/*.ts` files this way — no import map was needed since all other deps used
direct `npm:`/`https:` specifiers.

**How to apply:** When deploying via curl/CodeExecution, never print the access token; read it via env var interpolation only (`Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}`).

## Known bundler trap: `.d.ts`-only deps can pull in native modules
Deno's bundler used by this deploy endpoint walks *type-only* `.d.ts` edges, not just runtime imports. `linkedom`'s
package ships a `types/.../canvas-element.d.ts` that references `esm.sh/canvas@3.2.3`, which requires a native
`canvas.node` binary — this makes the whole deploy fail with "Module not found ...canvas.node" even though the
canvas code path is never executed at runtime. Appending `?no-dts` to the esm.sh import did NOT fix it (the type
edge is inside the package's own "types" export, unaffected by that flag).

**Why:** Any esm.sh package graph should be checked with `deno info <file>` before deploying — if it drags in a
`.node` binary anywhere in the tree, the Management API deploy will hard-fail on it even if your code doesn't use that feature.

**How to apply:** For DOM parsing / Readability-style content extraction in Supabase Edge Functions, prefer
`https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts` (`DOMParser`) over `linkedom` — it's Deno-native,
pairs fine with `@mozilla/readability`, and has no native-binary type edges. Verify with `deno info` (grep for
`.node` or `canvas`) before deploying any new npm/esm.sh dependency into an edge function.
