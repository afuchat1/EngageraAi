---
name: Engagera sidebar
description: AppLayout collapsible sidebar state, nav items, logout placement
---

## Collapsible sidebar

- State: `collapsed` boolean, initialized from `localStorage.getItem("sidebar_collapsed") === "true"`
- Persisted: `useEffect` → `localStorage.setItem("sidebar_collapsed", String(collapsed))`
- Desktop widths: `w-[220px]` (expanded) / `w-[60px]` (collapsed)
- Transition: `transition-all duration-200 ease-in-out` on the `<aside>`
- Toggle button: bottom of sidebar, `<ChevronLeft>` / `<ChevronRight>`
- NavLinks show icon + label when expanded; icon-only with hover tooltip when collapsed

## Nav items

Main nav: Chat (/), Playground (/playground), Docs (/docs), Dashboard (/dashboard), Usage (/usage)
Bottom (above collapse toggle): Settings (/settings)

**Logout lives exclusively in /settings** — not in sidebar quick access. This was a deliberate UX decision.

## Mobile

Uses a Sheet (right-side drawer) triggered by a Menu/X button in the mobile header.

## /settings route

Protected route added to App.tsx:
```tsx
<Route path="/settings"><ProtectedRoute component={Settings} /></Route>
```

Settings page contains: email (read-only), email notifications toggle, API Keys link (→ /dashboard), Sign out button (with custom confirm dialog).
