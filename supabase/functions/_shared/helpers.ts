import { createClient } from "npm:@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-session-id, x-engagera-api-key",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

export function cors(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}

export function adminDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export async function requireAuth(
  req: Request,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return json({ error: "Missing or invalid authorization header" }, 401);
  }
  const token = authHeader.slice(7);
  const db = adminDb();
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) {
    return json({ error: "Invalid or expired token" }, 401);
  }
  return { userId: data.user.id };
}

export async function optionalAuth(
  req: Request,
): Promise<{ userId?: string; guestSessionId?: string }> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data } = await adminDb().auth.getUser(token);
    if (data.user) return { userId: data.user.id };
  }
  const guestId = req.headers.get("x-guest-session-id")?.trim();
  if (guestId) return { guestSessionId: guestId };
  return {};
}
