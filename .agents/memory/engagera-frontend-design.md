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
Messages area must be `flex-1 overflow-y-auto` inside a `flex flex-col h-full` container. Input is a `shrink-0` footer. Messages use `break-words whitespace-pre-wrap`.

**Why:** Without this, messages get clipped. This was a core user requirement.

## Mobile keyboard fix (critical)
`body, #root` must use `position: fixed; inset: 0; height: 100dvh` in index.css. PublicLayout uses `h-full` not `h-screen`.

**Why:** On mobile, when the soft keyboard appears, `100vh` stays fixed but the visual viewport shrinks — causing the browser to scroll the page upward and push the header off-screen. `position: fixed; inset: 0` prevents that scroll. `height: 100dvh` adjusts dynamically with the keyboard.

## Auto model selection
`detectModel(text, attachments?)` in `@/lib/autoModel.ts` returns one of 7 model IDs. Landing page calls it on every input change (useEffect) and on send. No manual dropdown — a small pill indicator shows the auto-detected model with "· auto" suffix.

## Guest limit modal
Use a `fixed inset-0 z-50` overlay, not `absolute bottom-full`. Trigger on: `status === 429`, `status === 403`, `err?.data?.guestMessageLimit`, or `res.guestMessageCount >= res.guestMessageLimit` in onSuccess.

## Text style convention
Guest badge and disclaimers use normal text — no `font-mono uppercase tracking-widest`. Only technical labels (API keys, code) use monospace.

## Source link policy
Sources, citations, and web search indicators are NEVER shown to users. The AI presents knowledge naturally without exposing origins. `sanitizeResponse()` in `landing.tsx` strips markdown links with URLs, bare URLs, "According to...", "Based on search results...", and citation markers [1][2] before rendering. `MessageContent` accepts no `sources` prop.

## Edge function system prompt (important)
System prompt in `supabase/functions/chat/index.ts` is updated to be natural/conversational — tells AI to never say "according to search results", "based on web search", "as of my knowledge cutoff", etc. Must deploy via Management API (needs SUPABASE_ACCESS_TOKEN Replit secret) or paste in Supabase Dashboard → Edge Functions → chat → Edit.

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
