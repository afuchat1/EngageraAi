/**
 * Thin proxy helper — forwards Express requests to Supabase Edge Functions.
 *
 * No secrets live here. SUPABASE_URL and SUPABASE_ANON_KEY are public values.
 * Auth is forwarded with one special case: Engagera API keys (eng_...) cannot
 * be sent as a Bearer token to the Supabase gateway because the gateway only
 * accepts valid Supabase JWTs.  Instead we move the eng_ key to the custom
 * header x-engagera-api-key and use the anon key for gateway authentication.
 */
import type { Request, Response } from "express";

// Public Supabase project credentials — safe to hardcode as fallback.
// Set SUPABASE_URL / SUPABASE_ANON_KEY env vars in deployment to override.
const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJobnNqcXF0ZHpsa3ZxYXpmY2JnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE2NzA4NjksImV4cCI6MjA3NzI0Njg2OX0.j8zuszO1K6Apjn-jRiVUyZeqe3Re424xyOho9qDl_oY";

export function edgeFnUrl(slug: string): string {
  return `${SUPABASE_URL}/functions/v1/${slug}`;
}

/**
 * Forward an Express request to a Supabase Edge Function URL and pipe
 * the response back.
 *
 * Auth forwarding rules:
 *  - Supabase JWT / anon key  → passed as-is in Authorization
 *  - Engagera API key (eng_…) → moved to x-engagera-api-key; anon key used
 *    for Authorization so the Supabase gateway accepts the request
 *  - x-guest-session-id       → forwarded verbatim
 */
export async function proxyToEdge(
  req: Request,
  res: Response,
  targetUrl: string,
  overrideBody?: unknown,
): Promise<void> {
  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer eng_")) {
    // Engagera developer API key — Supabase gateway rejects non-JWT bearers,
    // so forward the key in a dedicated header and satisfy the gateway with
    // the public anon key.
    forwardHeaders["x-engagera-api-key"] = auth.slice(7); // strip "Bearer "
    forwardHeaders["Authorization"] = `Bearer ${SUPABASE_ANON_KEY}`;
  } else if (auth) {
    forwardHeaders["Authorization"] = auth;
  }

  const guestId = req.headers["x-guest-session-id"];
  if (typeof guestId === "string" && guestId) {
    forwardHeaders["x-guest-session-id"] = guestId;
  }

  // Forward the original query string (e.g. ?status=pending) unless the
  // caller already baked query params into targetUrl.
  const queryIndex = req.originalUrl.indexOf("?");
  if (queryIndex !== -1 && !targetUrl.includes("?")) {
    targetUrl = `${targetUrl}${req.originalUrl.slice(queryIndex)}`;
  }

  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers: forwardHeaders,
    body: ["GET", "HEAD"].includes(req.method)
      ? undefined
      : JSON.stringify(overrideBody ?? req.body),
  });

  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}
