import { cors, json, adminDb, optionalAuth } from "../_shared/helpers.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();

  const { userId, guestSessionId } = await optionalAuth(req);
  const db = adminDb();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);

  const messagesIdx = parts.indexOf("messages");
  const isMessages = messagesIdx !== -1;
  const convIdStr = isMessages ? parts[messagesIdx - 1] : parts[parts.length - 1];
  const convId = convIdStr && convIdStr !== "conversations" ? parseInt(convIdStr, 10) : NaN;

  const ownerCol = userId ? "user_id" : "guest_session_id";
  const ownerVal = userId ?? guestSessionId ?? "";

  if (req.method === "GET" && isNaN(convId)) {
    if (!userId && !guestSessionId) return json([]);
    const { data, error } = await db
      .from("engagera_conversations")
      .select("id, title, model, message_count, created_at, updated_at")
      .eq(ownerCol, ownerVal)
      .order("updated_at", { ascending: false })
      .limit(50);
    if (error) return json({ error: "Failed to load conversations" }, 500);
    return json(
      (data ?? []).map((c: { id: number; title: string; model: string; message_count: number; created_at: string; updated_at: string }) => ({
        id: c.id, title: c.title, model: c.model,
        messageCount: c.message_count, createdAt: c.created_at, updatedAt: c.updated_at,
      })),
    );
  }

  if (isNaN(convId)) return json({ error: "Invalid conversation id" }, 400);

  if (!userId && !guestSessionId) return json({ error: "Authentication required" }, 401);

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
