---
name: Engagera frontend design system
description: Design conventions and routing rules established in the full frontend rebuild
---

# Engagera Frontend Design System

## Color constraint
Pure black/white only — #000 background, #fff text. Borders use `white/[0.08]` to `white/[0.20]` opacity. No color accents. Any syntax highlighter must use a monochrome theme (plain `<pre><code>` preferred over react-syntax-highlighter to avoid colored tokens leaking).

**Why:** User-stated non-negotiable. B&W-only is a brand requirement.

## Layout architecture
- **Public routes** (`/`, `/docs`, auth pages): `PublicLayout` — top nav with logo, Chat/Docs links, Sign In + Sign Up CTAs
- **App routes** (`/dashboard`, `/playground`, `/usage`): `AppLayout` — sidebar on desktop, bottom nav on mobile (md:hidden)
- **Landing** (`/`): fullscreen chat, no AppLayout wrapper; sidebar for conversation history on desktop (authenticated only), Sheet drawer on mobile

**How to apply:** When adding a new page, decide public vs private first. Public → wrap with `<PublicLayout>`. Private → wrap with `<AppLayout>` and add to `ProtectedRoute` in App.tsx.

## Chat layout rule (critical)
Messages area must be `flex-1 overflow-y-auto` inside a `flex flex-col h-screen` (or h-dvh) container. Input is a fixed-height footer in normal flow — never position:fixed. Messages use `break-words whitespace-pre-wrap`.

**Why:** Without this, messages get clipped. This was a core user requirement.

## Routing (App.tsx)
- Public (no guard): `/`, `/docs`, `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`
- Private (ProtectedRoute): `/dashboard`, `/playground`, `/usage`
- ProtectedRoute redirects to `/sign-in` when `!user && !loading`

## Hook queryKey pattern
`useGetConversationMessages` requires explicit queryKey:
```ts
useGetConversationMessages(id!, {
  query: { enabled: !!id, queryKey: getGetConversationMessagesQueryKey(id!) }
})
```

## Design tokens
- Primary button: `bg-white text-black hover:bg-white/90`
- Ghost button: `text-white/60 hover:text-white hover:bg-white/[0.05]`
- Input: `bg-transparent border border-white/10 focus:border-white/30`
- Card/surface: `bg-white/[0.03] border border-white/10`
- Section labels: `text-[10px] font-mono uppercase tracking-widest text-white/40`
