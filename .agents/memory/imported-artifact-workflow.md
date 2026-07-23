---
name: Imported artifact workflow wiring
description: How to recover preview serving when an imported Vite artifact is present but not registered as a managed artifact workflow.
---

Imported Vite projects can arrive with a valid `artifacts/<slug>/.replit-artifact/artifact.toml` and a working app, while the artifact registry and managed workflow are not yet available. In that case, preserve the artifact source and wire the existing package dev command into a descriptive project workflow, using the port the app actually opens.

**Why:** Imported metadata and workflow registration can be applied in separate platform steps, so assuming the managed workflow exists can block an otherwise healthy app.

**How to apply:** Confirm the existing artifact command and runtime port from its Vite config/logs, configure one descriptive preview workflow, and verify the root URL responds before changing application code.