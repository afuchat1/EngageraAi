import { createClient } from "npm:@supabase/supabase-js@2";

// ── Inline helpers (shared module unavailable in single-file deploy) ──────────
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-engagera-api-key",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

function cors(): Response {
  return new Response("ok", { headers: CORS_HEADERS });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function adminDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function resolveUser(
  req: Request,
): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const db = adminDb();
    const { data } = await db.auth.getUser(token);
    if (data.user) return data.user.id;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();

  const userId = await resolveUser(req);
  if (!userId) return json({ error: "Authentication required" }, 401);
  const db = adminDb();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  const messagesIdx = parts.indexOf("messages");
  const isMessages = messagesIdx !== -1;
  const convIdStr = isMessages ? parts[messagesIdx - 1] : parts[parts.length - 1];
  const convId = convIdStr && convIdStr !== "conversations" ? parseInt(convIdStr, 10) : NaN;

  const ownerCol = "user_id";
  const ownerVal = userId;

  // ── GET list ──────────────────────────────────────────────────────────────
  if (req.method === "GET" && isNaN(convId) && !isMessages) {
    const modelFilter = url.searchParams.get("model");
    let query = db
      .from("engagera_conversations")
      .select("id, title, model, message_count, created_at, updated_at")
      .eq(ownerCol, ownerVal)
      // Lab/reasoning sessions are not chat history and must never appear in
      // the chat sidebar. Legacy rows remain inaccessible through this list.
      .not("model", "in", "(engagera-reason,engagera-2.1)")
      .order("updated_at", { ascending: false })
      .limit(50);
    if (modelFilter) query = (query as typeof query).eq("model", modelFilter);
    const { data, error } = await query;
    if (error) return json({ error: "Failed to load conversations" }, 500);
    return json(
      (data ?? []).map((c: { id: number; title: string; model: string; message_count: number; created_at: string; updated_at: string }) => ({
        id: c.id, title: c.title, model: c.model,
        messageCount: c.message_count, createdAt: c.created_at, updatedAt: c.updated_at,
      })),
    );
  }

  // ── POST create (voice conversation) ─────────────────────────────────────
  if (req.method === "POST" && isNaN(convId) && !isMessages) {
    let body: { title?: string; model?: string; messages?: Array<{ role: string; content: string }> };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { title = "Voice Conversation", model = "voice", messages = [] } = body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array required" }, 400);
    }

    const { data: conv, error: convErr } = await db
      .from("engagera_conversations")
      .insert({ title, model, message_count: messages.length, [ownerCol]: ownerVal })
      .select("id")
      .single();
    if (convErr || !conv) return json({ error: "Failed to create conversation" }, 500);

    const rows = (messages as Array<{ role: string; content: string }>).map((m) => ({
      conversation_id: (conv as { id: number }).id,
      role: m.role,
      content: m.content,
    }));
    const { error: msgErr } = await db.from("engagera_messages").insert(rows);
    if (msgErr) return json({ error: "Failed to save messages" }, 500);

    return json({ id: (conv as { id: number }).id });
  }

  if (isNaN(convId)) return json({ error: "Invalid conversation id" }, 400);

  // ── GET messages ──────────────────────────────────────────────────────────
  if (req.method === "GET" && isMessages) {
    const { data: conv } = await db
      .from("engagera_conversations")
      .select("id")
      .eq("id", convId)
      .eq(ownerCol, ownerVal)
      .single();
    if (!conv) return json({ error: "Conversation not found" }, 404);

    const { data, error } = await db
      .from("engagera_messages")
      .select("id, role, content, created_at, metadata")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    if (error) return json({ error: "Failed to load messages" }, 500);
    return json(
      (data ?? []).map((m: { id: number; role: string; content: string; created_at: string; metadata: { sources?: unknown[]; timeInfo?: unknown } | null }) => ({
        id: m.id, role: m.role, content: m.content, createdAt: m.created_at,
        sources: m.metadata?.sources ?? undefined,
        timeInfo: m.metadata?.timeInfo ?? undefined,
      })),
    );
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (req.method === "DELETE") {
    const { error } = await db
      .from("engagera_conversations")
      .delete()
      .eq("id", convId)
      .eq(ownerCol, ownerVal);
    if (error) return json({ error: "Failed to delete conversation" }, 500);
    return json({ success: true });
  }

  return json({ error: "Not found" }, 404);
});
