import { createClient } from "npm:@supabase/supabase-js@2";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-engagera-api-key",
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

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Resolve an Engagera API key (x-engagera-api-key header) to a userId.
 *  Returns null if the key is missing, invalid, or inactive. */
async function resolveApiKey(req: Request): Promise<string | null> {
  const key = req.headers.get("x-engagera-api-key")?.trim();
  if (!key?.startsWith("eng_")) return null;
  const hash = await sha256hex(key);
  const { data } = await adminDb()
    .from("engagera_api_keys")
    .select("user_id, is_active")
    .eq("key_hash", hash)
    .single();
  if (data?.is_active) return data.user_id as string;
  return null;
}

export async function requireAuth(
  req: Request,
): Promise<{ userId: string } | Response> {
  // 1. Engagera API key
  const apiKeyUserId = await resolveApiKey(req);
  if (apiKeyUserId) return { userId: apiKeyUserId };

  // 2. Supabase JWT
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
