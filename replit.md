# Engagera

Engagera is a black-and-white AI chat product: a web app (`artifacts/engagera`), a pitch deck (`artifacts/engagera-pitch-deck`), and a native Android-first mobile app (`artifacts/mobile`). Both the web and mobile clients talk directly to the same deployed Supabase project (auth + edge functions) — there is no dependency on `artifacts/api-server` for the chat feature today.

## Run & Operate

- `pnpm --filter @workspace/engagera run dev` — run the web app
- `pnpm --filter @workspace/mobile run dev` — run the Expo mobile app
- `pnpm --filter @workspace/api-server run dev` — run the API server (currently broken — missing esbuild; not used by chat)
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
- `supabase/functions/models` — exposes `engagera-2.0` (default) and `engagera-2.1` (used by mobile's Lab tab for research)

## Architecture decisions

- Mobile app is a fully independent codebase from the web app (no shared imports) but mirrors its black/white visual identity and guest-session/auth patterns natively.
- Mobile talks straight to the public Supabase URL/anon key (same as web) instead of `api-server`, per explicit product decision to avoid running/maintaining a separate backend for this app.
- Mobile's "Lab" tab is the `engagera-2.1` model with `contextHint: "research"`, reusing the chat function's existing web-search/citation support rather than a new backend feature.

## Product

- Web: full Engagera product (chat, docs, admin, etc. — see `artifacts/engagera`).
- Mobile: minimal, Android-first native companion — one Chat tab (text + image chat, streaming, guest quota) and one Lab tab (deeper research mode with cited sources). No dev tools or admin screens by design.

## User preferences

- Mobile app must stay Android-first/minimal: no API servers, no extra API keys, no background execution, no permissions beyond what's used (photo library only — no camera).

## Gotchas

- `artifacts/api-server` currently fails to start (missing esbuild) — this is a known, currently-unaddressed issue and is not required for the chat feature to work. Left broken intentionally: do not migrate any data flow onto it; web and mobile must keep talking directly to the Supabase edge functions.
- Replit's built-in Expo publish flow (EAS via Expo Launch) only supports iOS App Store submission, not Google Play — keep this in mind since the mobile app's target platform is Android.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
