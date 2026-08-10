---
name: Workspace dependency restore
description: A package can be declared and locked while missing from the installed workspace modules.
---

When Vite reports that an already-declared package cannot be resolved, restore the workspace with the lockfile before editing application code.

**Why:** A stale or incomplete install can leave package.json and pnpm-lock.yaml correct while the app's node_modules links are absent.

**How to apply:** Run `pnpm install --frozen-lockfile`, restart the affected artifact workflow, then verify both the preview and its production build.