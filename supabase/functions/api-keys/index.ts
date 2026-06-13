import { cors, json, adminDb, requireAuth } from "../_shared/helpers.ts";

function generateApiKey(): { key: string; prefix: string; hash: string } {
  const raw = `eng_${Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")}`;
  const prefix = raw.slice(0, 12);
  const encoder = new TextEncoder();
  return { key: raw, prefix, _hash: "" } as unknown as { key: string; prefix: string; hash: string };
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const db = adminDb();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const idParam = parts[parts.length - 1];
  const isItem = idParam && idParam !== "api-keys";

  if (req.method === "GET" && !isItem) {
    const { data, error } = await db
      .from("engagera_api_keys")
      .select("id, name, prefix, is_active, total_requests, last_used_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json(
      (data ?? []).map((k) => ({
        id: k.id, name: k.name, prefix: k.prefix, isActive: k.is_active,
        totalRequests: k.total_requests, lastUsedAt: k.last_used_at, createdAt: k.created_at,
      })),
    );
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => ({}));
    const { name } = body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return json({ error: "name is required" }, 400);
    }
    const rawKey = `eng_${Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, "0")).join("")}`;
    const prefix = rawKey.slice(0, 12);
    const hash = await sha256hex(rawKey);

    const { data, error } = await db
      .from("engagera_api_keys")
      .insert({ user_id: userId, name: name.trim(), key_hash: hash, prefix, is_active: true })
      .select("id, name, prefix, is_active, created_at")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ id: data.id, name: data.name, prefix: data.prefix, key: rawKey, isActive: data.is_active, createdAt: data.created_at }, 201);
  }

  if (req.method === "DELETE" && isItem) {
    const id = parseInt(idParam, 10);
    if (isNaN(id)) return json({ error: "Invalid id" }, 400);
    const { error } = await db
      .from("engagera_api_keys")
      .update({ is_active: false })
      .eq("id", id)
      .eq("user_id", userId);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, message: "API key revoked" });
  }

  return json({ error: "Not found" }, 404);
});
