# Engagera

Engagera is a black-and-white AI chat product: a web app (`artifacts/engagera`), a pitch deck (`artifacts/engagera-pitch-deck`), and a native Android-first mobile app (`artifacts/mobile`). Both the web and mobile clients talk directly to the same deployed Supabase project (auth + edge functions) — there is no local API server anywhere in this workspace; all backend logic (chat, search, etc.) lives in Supabase Edge Functions.

## Run & Operate

- `pnpm --filter @workspace/engagera run dev` — run the web app
- `pnpm --filter @workspace/mobile run dev` — run the Expo mobile app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React + Vite, black/white theme (`artifacts/engagera/src/index.css`)
- Mobile: Expo SDK 55, expo-router, React Native 0.83 (Android-first; also runs on iOS/web)
- Backend: Supabase (Postgres + Auth + Edge Functions in `supabase/functions/*`) — deployed independently, not part of this pnpm workspace's dev servers
- API codegen (`lib/api-spec`, `@workspace/api-client-react`) exists but is not used by the chat feature; both clients call the Supabase `chat`/`models` edge functions directly

## Where things live

- `artifacts/engagera` — web app (marketing + chat UI)
- `artifacts/engagera-pitch-deck` — slides artifact
- `artifacts/mobile` — Expo app: Chat tab + Lab (research) tab, guest mode (5 free messages) mirroring the web app's guest limit, sign-in/sign-up as a bottom sheet
- `supabase/functions/chat` — shared chat edge function (streaming, vision via `image_url` parts, guest sessions via `x-guest-session-id` header, optional web-search/citations surfaced as `searchInfo`)
- `supabase/functions/models` — exposes `engagera-2.0` (default) and `engagera-2.1`
- `supabase/functions/search` — mobile Lab tab's search backend (web/images/videos/news/finance via DuckDuckGo, Bing News RSS, Google News RSS, curated outlet RSS feeds, Bing image search, YouTube search)

## Architecture decisions

- Mobile app is a fully independent codebase from the web app (no shared imports) but mirrors its black/white visual identity and guest-session/auth patterns natively.
- Mobile talks straight to the public Supabase URL/anon key (same as web), per explicit product decision to avoid running/maintaining a separate backend for this app.
- Mobile's "Lab" tab is a standalone search engine (`SearchEngine.tsx`), not the chat model — it calls the `search` Supabase edge function, which aggregates DuckDuckGo, Bing News RSS, Google News RSS, curated outlet RSS feeds, Bing image search, and YouTube search. No API key required, no local backend.

## Product

- Web: full Engagera product (chat, docs, admin, etc. — see `artifacts/engagera`).
- Mobile: minimal, Android-first native companion — one Chat tab (text + image chat, streaming, guest quota) and one Lab tab (deeper research mode with cited sources). No dev tools or admin screens by design.

## User preferences

- Never create an Express API server or any other backend server — all backend logic must go through Supabase (edge functions, auth, database). No new environment variables.


- Mobile app must stay Android-first/minimal: no API servers, no extra API keys, no background execution, no permissions beyond what's used (photo library only — no camera).
- Any chat-UI/feature change made to the web app (`artifacts/engagera`) must also be ported to the mobile app (`artifacts/mobile`) in the same pass — the user expects both clients to stay in parity, not just web.

## Gotchas

- Replit's built-in Expo publish flow (EAS via Expo Launch) only supports iOS App Store submission, not Google Play — keep this in mind since the mobile app's target platform is Android.
- The `search` edge function scrapes DuckDuckGo/Bing/YouTube HTML pages directly (no API key, no official API) — these are unofficial endpoints that can change layout without notice; each fetch has a timeout and fails soft to an empty array rather than throwing.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
