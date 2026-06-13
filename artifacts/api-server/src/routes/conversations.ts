import { Router } from "express";
import { engageraDb } from "../lib/supabase";
import { optionalAuth, type OptionalAuthRequest } from "../middlewares/optionalAuth";

const router = Router();

/**
 * Resolve conversation ownership filter.
 * Returns a typed Supabase query filter for the caller's identity.
 */
function ownerFilter(userId?: string, guestSessionId?: string): { column: string; value: string } {
  return userId
    ? { column: "user_id", value: userId }
    : { column: "guest_session_id", value: guestSessionId ?? "" };
}

/**
 * GET /conversations
 * List all conversations for the authenticated user or guest session.
 */
router.get("/conversations", optionalAuth, async (req: OptionalAuthRequest, res) => {
  const { userId, guestSessionId } = req;
  if (!userId && !guestSessionId) {
    res.json([]);
    return;
  }

  const f = ownerFilter(userId, guestSessionId);
  const { data, error } = await engageraDb
    .from("engagera_conversations")
    .select("id, title, model, message_count, created_at, updated_at")
    .eq(f.column, f.value)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    req.log.error({ err: error }, "Failed to list conversations");
    res.status(500).json({ error: "Failed to load conversations" });
    return;
  }

  res.json(
    (data ?? []).map((c) => ({
      id: c.id,
      title: c.title,
      model: c.model,
      messageCount: c.message_count,
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    }))
  );
});

/**
 * DELETE /conversations/:id
 * Delete a conversation (and cascade-delete its messages via FK).
 */
router.delete("/conversations/:id", optionalAuth, async (req: OptionalAuthRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const { userId, guestSessionId } = req;
  if (!userId && !guestSessionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const f = ownerFilter(userId, guestSessionId);
  const { error } = await engageraDb
    .from("engagera_conversations")
    .delete()
    .eq("id", id)
    .eq(f.column, f.value);

  if (error) {
    req.log.error({ err: error }, "Failed to delete conversation");
    res.status(500).json({ error: "Failed to delete conversation" });
    return;
  }

  res.json({ success: true });
});

/**
 * GET /conversations/:id/messages
 * Get all messages in a conversation.
 */
router.get("/conversations/:id/messages", optionalAuth, async (req: OptionalAuthRequest, res) => {
  const id = parseInt(String(req.params.id), 10);
  const { userId, guestSessionId } = req;
  if (!userId && !guestSessionId) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const f = ownerFilter(userId, guestSessionId);
  const { data: conv } = await engageraDb
    .from("engagera_conversations")
    .select("id")
    .eq("id", id)
    .eq(f.column, f.value)
    .single();

  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const { data, error } = await engageraDb
    .from("engagera_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    req.log.error({ err: error }, "Failed to load messages");
    res.status(500).json({ error: "Failed to load messages" });
    return;
  }

  res.json(
    (data ?? []).map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.created_at,
    }))
  );
});

export default router;
