---
name: Template literal backtick crash pattern
description: How an unescaped backtick inside a Deno/JS template-literal system prompt caused a silent Edge Function crash (WORKER_ERROR) and how to find it fast next time.
---

A Supabase Edge Function (or any Deno/JS file) that defines a long prompt as a
backtick template literal (`` const X = `...`; ``) will silently break if the
prompt text itself contains a literal, unescaped backtick (e.g. writing
`` `.md` `` inside the prompt to mean "the .md extension"). The template
closes early, the remaining text is parsed as JS, and — because a string is
immediately followed by another template literal — it becomes a tagged
template call, throwing `TypeError: "<string>" is not a function` at runtime.

**Symptom:** the function deploys/boots fine (valid syntax overall) but every
request returns `{"code":"WORKER_ERROR"}` with no obvious cause from the
outside.

**How to diagnose fast:** query Supabase's `function_logs` analytics table via
the Management API (`POST/GET .../analytics/endpoints/logs.all` with a `sql`
param) — `function_edge_logs` is often empty/delayed, but `function_logs`
carries the actual `UncaughtException` event with the real stack trace and
line number.

**How to find the bug:** `grep -n '`' <file> | grep -v '```' | grep -v '\\`'`
inside the suspect template literal's line range — any bare backtick that
isn't a fenced code-block marker or already escaped is the culprit. Fix by
switching to a different quote style (e.g. single quotes) for inline
"code" mentions inside prompt text, not by escaping (escaping also works but
is easy to miss on the next edit).

**Related:** the same file also had an "images render as broken text" bug
from constructing markdown image syntax (`![alt](data:...)`) using unsanitized
user-provided text as the alt portion — any `[`, `]`, `(`, `)` or newline in
that text breaks the markdown image syntax. Always strip those characters
from alt text before interpolating into markdown image syntax.
