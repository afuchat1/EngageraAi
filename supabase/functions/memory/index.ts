/**
 * Engagera Memory Edge Function
 * 
 * Manages long-term memory for authenticated users.
 * 
 * GET    /memory          — list all memories
 * POST   /memory          — add a memory manually
 * PATCH  /memory/:id      — update importance/content
 * DELETE /memory/:id      — delete a memory
 * DELETE /memory          — clear all memories
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader     = req.headers.get("authorization") ?? "";
  const bearerToken    = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!bearerToken) return json({ error: "Authentication required" }, 401);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: userData } = await db.auth.getUser(bearerToken);
  if (!userData.user) return json({ error: "Invalid token" }, 401);
  const userId = userData.user.id;

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  // pathParts: ["memory"] or ["memory", ":id"]
  const memoryId = pathParts.length > 1 ? pathParts[pathParts.length - 1] : null;

  // GET /memory — list memories
  if (req.method === "GET") {
    const { data, error } = await db
      .from("engagera_memories")
      .select("id, content, importance, source, tags, created_at")
      .eq("user_id", userId)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ memories: data ?? [] });
  }

  // POST /memory — add memory
  if (req.method === "POST") {
    let body: { content?: string; importance?: number; tags?: string[] };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.content?.trim()) return json({ error: "content is required" }, 400);
    const { data, error } = await db.from("engagera_memories").insert({
      user_id:    userId,
      content:    body.content.trim(),
      importance: Math.min(10, Math.max(1, body.importance ?? 5)),
      tags:       body.tags ?? [],
      source:     "user_added",
    }).select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ memory: data }, 201);
  }

  // PATCH /memory/:id — update memory
  if (req.method === "PATCH" && memoryId) {
    let body: { content?: string; importance?: number; tags?: string[] };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.content) updates.content = body.content.trim();
    if (body.importance) updates.importance = Math.min(10, Math.max(1, body.importance));
    if (body.tags) updates.tags = body.tags;
    const { data, error } = await db
      .from("engagera_memories")
      .update(updates)
      .eq("id", memoryId)
      .eq("user_id", userId)
      .select().single();
    if (error) return json({ error: error.message }, 500);
    return json({ memory: data });
  }

  // DELETE /memory/:id — delete one
  if (req.method === "DELETE" && memoryId && memoryId !== "memory") {
    const { error } = await db
      .from("engagera_memories")
      .delete()
      .eq("id", memoryId)
      .eq("user_id", userId);
    if (error) return json({ error: error.message }, 500);
    return json({ deleted: true });
  }

  // DELETE /memory — clear all
  if (req.method === "DELETE") {
    const { error } = await db
      .from("engagera_memories")
      .delete()
      .eq("user_id", userId);
    if (error) return json({ error: error.message }, 500);
    return json({ deleted: true });
  }

  return json({ error: "Not found" }, 404);
});
