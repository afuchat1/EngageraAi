---
name: Vercel import already in pnpm-workspace shape
description: Some Vercel-imported projects are already Vite + pnpm-workspace apps (not Next.js) — check before applying the standard Next.js→Vite port.
---

Before running the full Vercel port workflow (Next.js routing → wouter, next/image → img, API routes → Express, etc.), inspect `.migration-backup/` for signs the app was already built directly for the Replit pnpm-workspace stack: a `pnpm-workspace.yaml`/`artifacts/*` layout, a `replit.md` describing Replit-specific architecture decisions, and no `next.config.*` or Next.js dependency. In that case the "port" is really just copying files into a freshly created artifact and wiring up the workflow — skip the Next.js conversion steps entirely.

**Why:** Running the full conversion workflow on an app that's already Vite-shaped wastes effort and risks introducing regressions into code that didn't need touching. The user may explicitly say "don't migrate, just get it running" to signal this.

**How to apply:** Diff `.migration-backup/<app>/package.json` for a `next` dependency and check for `next.config.*` before deciding whether real Next.js→Vite conversion is needed. If absent, just: create the target artifact via `createArtifact`, copy source/config files over the scaffold, merge `package.json` dependencies, copy any real `lib/*` generated content (openapi spec, generated api hooks) that the scaffold left as placeholders, install, and restart the workflow.

**Gotcha:** if `.migration-backup/artifacts/<slug>/.replit-artifact/` still contains an `artifact.toml` with the same `id` as the artifact you just created, the platform's artifact scan will register `.migration-backup/...` as a duplicate of the live artifact (same artifactId, confusing duplicate workflows). Delete `.replit-artifact/` directories inside `.migration-backup/` immediately so it stays a plain backup, not a second live artifact.
