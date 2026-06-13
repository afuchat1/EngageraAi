/**
 * Thin proxy helper — forwards Express requests to Supabase Edge Functions.
 *
 * No secrets live here. SUPABASE_URL is a public endpoint.
 * Auth is passed through verbatim; the Edge Function verifies it.
 */
import type { Request, Response } from "express";

const SUPABASE_URL = process.env.SUPABASE_URL;

if (!SUPABASE_URL) {
  throw new Error("[Engagera] SUPABASE_URL must be set.");
}

export function edgeFnUrl(slug: string): string {
  return `${SUPABASE_URL}/functions/v1/${slug}`;
}

/**
 * Forward an Express request to a Supabase Edge Function URL and pipe
 * the response back. Passes Authorization and x-guest-session-id headers.
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
  if (auth) forwardHeaders["Authorization"] = auth;

  const guestId = req.headers["x-guest-session-id"];
  if (typeof guestId === "string" && guestId) {
    forwardHeaders["x-guest-session-id"] = guestId;
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
