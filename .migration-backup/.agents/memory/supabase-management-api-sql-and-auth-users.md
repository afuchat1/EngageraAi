---
name: Supabase Management API direct SQL + auth.users access
description: How to run ad-hoc SQL against a Supabase Postgres DB without the CLI/psql, and why auth.users needs the Admin API rather than PostgREST.
---

## Running SQL via the Management API
`POST https://api.supabase.com/v1/projects/{project-ref}/database/query` with `Authorization: Bearer <SUPABASE_ACCESS_TOKEN>` and JSON body `{ "query": "<sql>" }` executes arbitrary SQL (DDL and DML, e.g. `ALTER TABLE ... ADD COLUMN`, `INSERT`, ad-hoc `SELECT`) directly against the project's Postgres, returning rows as JSON (HTTP 201 on success).

**Why:** This is the way to inspect schema (`information_schema.columns`), add columns/indexes, or seed/clean up test data from the workspace sandbox when there's no CLI/Docker access and no service-role key exposed as a secret.

**How to apply:** Use it for schema migrations and one-off data fixes/verification. Never paste the access token into chat; read it via env var interpolation inside a `"use impure"` block.

## auth.users is not queryable via supabase-js `.from()`
The `auth` schema is not exposed through PostgREST by default, so `db.from("auth.users")` from an edge function (even with the service-role key) won't work. It *is* reachable via the Management API's raw SQL endpoint above (e.g. `select count(*) from auth.users`), but that's a workspace-side tool, not something edge function code can call.

**Why:** Edge functions need a different code path to resolve user emails/metadata.

**How to apply:** Inside edge functions, use `db.auth.admin.listUsers({ page, perPage })` (paginate or set a large `perPage`) to build an id→email map, or `db.auth.admin.getUserById(id)` for one-offs. Confirmed working with the service-role client from `_shared/helpers.ts`'s `adminDb()`.
