---
name: Imported artifact workflow wiring
description: How to recover preview serving when an imported Vite artifact is present but not registered as a managed artifact workflow.
---

Imported Vite projects can arrive with valid artifact metadata and a working app while workflow registration is incomplete. First check whether the managed `artifacts/<slug>: <service>` workflow exists. If it does, use it; if not, preserve the artifact source and wire the existing package dev command into one descriptive project workflow using the port the app actually opens.

**Why:** Imported metadata and workflow registration can be applied in separate platform steps, and a legacy workflow may use a different port than the artifact proxy expects. Either assumption can produce a false preview failure.

**How to apply:** Confirm the artifact command, managed workflow status, and runtime port from metadata/config/logs. Prefer restarting the managed workflow; only configure a replacement when no managed service exists, and remove any conflicting legacy workflow.