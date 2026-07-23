---
name: API and platform product boundary
description: Developer API authentication and context isolation rules.
---

Developer API requests authenticate with Engagera API keys and must be accepted by the edge function without Supabase JWT verification. API-key requests are not platform-user sessions: they must not load or write platform memories, settings, documents, agent state, or platform conversation history.

**Why:** Supabase gateway JWT verification caused valid API-key-only requests to fail before Engagera authentication, and using an API key's linked owner as a platform user mixed API and platform context.

**How to apply:** Keep API-key identity only for API usage/rate accounting. Accept developer system instructions and explicitly supplied dataset context from the developer request/environment, while keeping platform JWT memory features on the platform path only.