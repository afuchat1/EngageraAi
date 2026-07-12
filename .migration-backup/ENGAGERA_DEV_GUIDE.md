# Engagera Developer Guide

> **This document is the single source of truth for all development decisions on the Engagera platform.**
> Read it fully before making any changes. Follow every rule to avoid breaking production.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Design System](#2-design-system)
3. [Data & Storage Rules](#3-data--storage-rules)
4. [API Conventions](#4-api-conventions)
5. [Security Rules](#5-security-rules)
6. [Frontend Update Checklist](#6-frontend-update-checklist)
7. [Backend Update Checklist](#7-backend-update-checklist)
8. [Common Mistakes to Avoid](#8-common-mistakes-to-avoid)

---

## 1. Architecture Overview

```
Browser
  └─ React + Vite (artifacts/engagera/) — served at /
       └─ API Client (lib/api-client-react/) — generated from OpenAPI spec
            └─ Express API Server (artifacts/api-server/) — served at /api
                 └─ Supabase (PostgreSQL + Auth) — all data lives here
                      └─ Cloudflare (R2 / CDN) — all file/media storage
```

### Package Structure

| Package | Path | Purpose |
|---|---|---|
| `@workspace/engagera` | `artifacts/engagera/` | React frontend |
| `@workspace/api-server` | `artifacts/api-server/` | Express backend |
| `@workspace/api-spec` | `lib/api-spec/` | OpenAPI 3.0 spec (source of truth) |
| `@workspace/api-client-react` | `lib/api-client-react/` | Generated React Query hooks |
| `@workspace/api-zod` | `lib/api-zod/` | Generated Zod validation schemas |
| `@workspace/db` | `lib/db/` | Drizzle ORM schema (reference only) |

### Request Flow

```
User → Browser fetch /api/... → Replit proxy → Express (port 8080)
                                                  ├─ Auth middleware (Supabase JWT)
                                                  ├─ Route handler
                                                  └─ Supabase query → Response
```

---

## 2. Design System

### Brand & Identity

- **Logo**: White mark on transparent/dark background. File: `artifacts/engagera/public/logo.png`
- **Logo usage**: `<img src="/logo.png" alt="Engagera" className="h-7 w-7 object-contain" />`
- **Never** use colored icons (e.g., `SiDependabot`, `Sparkles`) as the logo substitute
- **Color scheme**: Pure black and white only. No accent colors, no green, no blue

### Color Tokens (Dark Mode — always active)

The app always runs in dark mode (enforced in `App.tsx`). These are the authoritative token values:

| Token | Value | Use |
|---|---|---|
| `--background` | `0 0% 0%` (pure black) | Page background |
| `--foreground` | `0 0% 97%` (near-white) | All text |
| `--primary` | `0 0% 100%` (white) | CTA buttons, active states |
| `--primary-foreground` | `0 0% 0%` (black) | Text on primary buttons |
| `--card` | `0 0% 5%` | Card/panel backgrounds |
| `--border` | `0 0% 11%` | All borders |
| `--muted-foreground` | `0 0% 55%` | Secondary text |
| `--destructive` | `0 72% 51%` (red) | Error/danger only |

**Rule**: Never hardcode hex colors. Always use CSS variables via Tailwind classes (`bg-background`, `text-foreground`, `border-border`, etc.).

**Exception**: The landing page uses raw opacity values like `border-white/[0.06]` for performance. This is acceptable only in the landing page which has its own full-screen layout.

### Typography

- **Font**: Inter (100–900 weights), loaded from Google Fonts
- **Mono**: JetBrains Mono (400, 500), for code and tokens
- **Headings**: `font-bold` or `font-black` with `tracking-tight`
- **Body**: `text-sm` (0.875rem) default, `text-base` for paragraphs
- **Never** use font sizes below `text-xs` (0.75rem) for meaningful content

### Spacing & Layout

- **Page padding**: `p-6 md:p-8` for authenticated pages
- **Max content width**: `max-w-6xl mx-auto` for dashboard, `max-w-4xl mx-auto` for docs
- **Card padding**: `px-6 py-6` (do not use `p-6` shorthand on cards — breaks mobile)
- **Border radius**: Use CSS variable `--radius` (0.5rem). Use `rounded-lg` as default.

### Responsive Breakpoints

- **Mobile-first**: Always write `sm:` / `md:` / `lg:` modifiers
- **Sidebar**: Hidden on mobile (`hidden md:flex`), replaced by bottom nav on mobile
- **Tables**: Hide secondary columns on mobile with `hidden sm:table-cell`
- **Bottom nav**: Auto-displayed for authenticated sidebar pages (handled in `AppLayout`)

### Component Rules

- **Buttons**: Use `<Button>` from `@/components/ui/button`. Never use raw `<button>` inside `AppLayout` pages.
- **Inputs**: Always set `className="h-10"` for consistency
- **Cards**: Always include `border-border` class: `<Card className="bg-card border-border">`
- **Tables**: Wrap in `rounded-lg border border-border overflow-hidden`
- **Loading states**: Use text `"—"` for number placeholders, `"Loading…"` for skeleton messages

---

## 3. Data & Storage Rules

### Golden Rule: Supabase for Everything, Cloudflare for Files

```
✅ User accounts          → Supabase Auth
✅ API keys (hashed)      → Supabase table: engagera_api_keys
✅ Conversations          → Supabase table: engagera_conversations
✅ Messages               → Supabase table: engagera_messages
✅ Usage records          → Supabase table: engagera_usage_records
✅ File uploads           → Cloudflare R2 (presigned URLs)
✅ Media / images         → Cloudflare CDN

❌ NEVER store files in Supabase Storage buckets
❌ NEVER store secrets in Replit environment variables (see Section 5)
❌ NEVER use a local SQLite or any other database
❌ NEVER use Replit's built-in PostgreSQL Database
```

### Supabase Schema Convention

All tables MUST follow these conventions:

```
- Schema:     public
- Prefix:     engagera_
- Client:     engageraDb (from artifacts/api-server/src/lib/supabase.ts)
- RLS:        Disabled (access controlled at API layer via JWT)
```

**Current tables:**

| Table | Key Columns | Notes |
|---|---|---|
| `engagera_api_keys` | `id`, `user_id`, `name`, `key_hash`, `prefix`, `is_active` | Hash with SHA-256, store prefix only |
| `engagera_conversations` | `id`, `user_id`, `guest_session_id`, `title`, `model` | Supports guest sessions |
| `engagera_messages` | `id`, `conversation_id`, `role`, `content` | FK → conversations |
| `engagera_usage_records` | `id`, `user_id`, `api_key_id`, `model`, `input_tokens`, `output_tokens` | Logged on every AI call |

**Adding a new table:**
1. Create it in Supabase dashboard with `engagera_` prefix
2. Add to `lib/db/src/schema/` if Drizzle types are needed
3. Add migration SQL to your migration history (document it)
4. Never run `drizzle-kit push` in production without a backup

### Cloudflare Storage

All file uploads go to Cloudflare R2. Pattern:

```
1. Frontend requests a presigned upload URL from /api/storage/presign
2. API server calls Cloudflare R2 API to generate the URL
3. Frontend uploads directly to R2 (never through the API server)
4. Frontend stores the public CDN URL in Supabase via an API endpoint
```

**Never** create Supabase Storage buckets. All `storage.supabase.co` URLs are forbidden.

---

## 4. API Conventions

### Source of Truth: OpenAPI Spec

The file `lib/api-spec/openapi.yaml` is the **single source of truth** for all API contracts.

**Workflow for adding a new endpoint:**

```bash
# 1. Edit the spec
lib/api-spec/openapi.yaml

# 2. Regenerate client hooks and types
pnpm --filter @workspace/api-spec run codegen

# 3. Implement the route in
artifacts/api-server/src/routes/

# 4. Register the route in
artifacts/api-server/src/routes/index.ts

# 5. Use the generated hook in the frontend
import { useMyNewEndpoint } from "@workspace/api-client-react";
```

**Never** call `fetch()` directly in frontend components. Always use generated hooks.

### Route Structure

```
GET    /api/healthz              — health check (no auth)
GET    /api/models               — list models (no auth)
POST   /api/chat/completions     — chat (optional auth / guest)
GET    /api/conversations        — list conversations (optional auth)
DELETE /api/conversations/:id    — delete (optional auth)
GET    /api/conversations/:id/messages — messages (optional auth)
GET    /api/api-keys             — list keys (requires auth)
POST   /api/api-keys             — create key (requires auth)
DELETE /api/api-keys/:id         — revoke key (requires auth)
GET    /api/usage                — usage records (requires auth)
GET    /api/usage/summary        — usage summary (requires auth)
GET    /api/dashboard/stats      — dashboard stats (requires auth)
```

### Response Shape

```typescript
// Success — arrays
res.json([...items])

// Success — objects
res.json({ field: value })

// Error
res.status(4xx | 5xx).json({ error: "Human-readable message" })
```

**Rule**: Never change the shape of an existing response without updating the OpenAPI spec and running codegen.

### Auth Middleware

```typescript
// Requires valid Supabase JWT
import { requireAuth } from "../middlewares/requireAuth";

// Allows both auth + guest (reads x-guest-session-id header)
import { optionalAuth } from "../middlewares/optionalAuth";
```

---

## 5. Security Rules

### API Key Storage

```
Raw key:     eng_<64 hex chars>   — shown to user ONCE, never stored
Hash:        SHA-256(raw key)     — stored in engagera_api_keys.key_hash
Prefix:      first 12 chars       — stored for display/identification only
```

Implementation in `artifacts/api-server/src/routes/apiKeys.ts`:
```typescript
function generateApiKey() {
  const raw = `eng_${crypto.randomBytes(32).toString("hex")}`;
  const prefix = raw.slice(0, 12);
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { key: raw, prefix, hash };
}
```

**Never** store raw API keys. **Never** log API keys. **Never** return them from any endpoint after creation.

### Environment Variables

The API server requires exactly two secrets to operate. These go in the server runtime environment — NOT in `.env` files committed to git:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |
| `OPENROUTER_API_KEY` | Optional — raises rate limits on free models |

**Never add** user-configurable secrets (like external service keys) to environment variables. Store them in a `engagera_user_settings` or similar Supabase table, encrypted at rest via Supabase's built-in encryption or a KMS column.

### Frontend Secrets

The frontend exposes nothing sensitive. It only uses:
- `VITE_SUPABASE_URL` — public, safe to expose
- `VITE_SUPABASE_ANON_KEY` — public anon key, safe to expose (RLS protects data)

**Never** put `SUPABASE_SERVICE_ROLE_KEY` in any `VITE_` variable.

---

## 6. Frontend Update Checklist

Before submitting any frontend change, verify:

- [ ] **No hardcoded colors** — all colors use Tailwind CSS variable classes
- [ ] **No `fetch()` calls** — all API calls use generated hooks from `@workspace/api-client-react`
- [ ] **Array.isArray() guards** — all `.map()` / `.find()` / `.filter()` calls are guarded
- [ ] **Mobile responsive** — tested at 375px (iPhone SE) and 1440px (desktop)
- [ ] **Logo correct** — use `<img src="/logo.png" ... />` not icon components
- [ ] **No Supabase Storage URLs** — no `storage.supabase.co` in any `src` attribute
- [ ] **Fonts** — body text uses Inter, code uses JetBrains Mono
- [ ] **Error states** — loading and empty states are handled for all data-dependent UI

---

## 7. Backend Update Checklist

Before submitting any backend change, verify:

- [ ] **OpenAPI spec updated** — `lib/api-spec/openapi.yaml` reflects all changes
- [ ] **Codegen run** — `pnpm --filter @workspace/api-spec run codegen` executed after spec changes
- [ ] **Table naming** — all new tables use `engagera_` prefix in `public` schema
- [ ] **No raw API key logging** — search for `key_hash`, `key`, verify not in logs
- [ ] **Auth middleware** — every route uses `requireAuth` or `optionalAuth`
- [ ] **Error responses** — all errors return `{ error: "message" }` with correct status code
- [ ] **No Supabase Storage** — no calls to `supabase.storage`
- [ ] **Cloudflare for files** — file handling routes use Cloudflare R2 presigned URLs
- [ ] **Build passes** — `pnpm --filter @workspace/api-server run build` completes without errors

---

## 8. Common Mistakes to Avoid

### ❌ Using `.map()` without Array.isArray() guard

```typescript
// WRONG — crashes if API returns error object or string
const { data: models } = useListModels();
return models.map(m => <div>{m.name}</div>);

// CORRECT
const { data: models } = useListModels();
return Array.isArray(models) ? models.map(m => <div>{m.name}</div>) : null;
```

### ❌ Adding a colored accent

```tsx
// WRONG — violates brand guidelines
<div className="bg-green-500 text-white">

// CORRECT
<div className="bg-primary text-primary-foreground">
```

### ❌ Creating a Supabase Storage bucket

```typescript
// WRONG — never do this
await supabase.storage.createBucket("uploads");
await supabase.storage.from("uploads").upload(path, file);

// CORRECT — use Cloudflare R2 presigned URLs
const { url } = await fetch("/api/storage/presign", { method: "POST", ... });
await fetch(url, { method: "PUT", body: file });
```

### ❌ Storing secrets in Replit env vars

```bash
# WRONG
OPENAI_API_KEY=sk-...   # in Replit secrets

# CORRECT
# Store in engagera_user_settings Supabase table
# Encrypt with pgcrypto or application-level encryption
```

### ❌ Calling fetch() directly in components

```typescript
// WRONG
const res = await fetch("/api/models");
const data = await res.json();

// CORRECT — always use generated hooks
import { useListModels } from "@workspace/api-client-react";
const { data: models } = useListModels();
```

### ❌ Editing artifact.toml directly

```
# WRONG — always use verifyAndReplaceArtifactToml()
# Direct edits can corrupt the artifact configuration

# CORRECT
# Use the artifact management tools / verifyAndReplaceArtifactToml()
```

### ❌ Using a non-engagera_ table prefix

```sql
-- WRONG
CREATE TABLE api_keys (...);
CREATE TABLE conversations (...);

-- CORRECT
CREATE TABLE engagera_api_keys (...);
CREATE TABLE engagera_conversations (...);
```

### ❌ Skipping codegen after OpenAPI changes

```bash
# After editing lib/api-spec/openapi.yaml, ALWAYS run:
pnpm --filter @workspace/api-spec run codegen

# Skipping this means the frontend types and hooks are out of sync
# with the actual API, causing TypeScript errors or runtime failures
```

---

## Deployment

1. Build the API server: `pnpm --filter @workspace/api-server run build`
2. Build the frontend: `pnpm --filter @workspace/engagera run build`
3. The API server serves from `artifacts/api-server/dist/index.mjs`
4. The frontend is served as static files from `artifacts/engagera/dist/public/`
5. Both are proxied through Cloudflare for DDoS protection and CDN caching

**Production environment variables** (set in your deployment platform):
- `PORT=8080`
- `NODE_ENV=production`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `OPENROUTER_API_KEY=...` (optional)

---

*Last updated: June 2026 · Engagera Platform v1*
