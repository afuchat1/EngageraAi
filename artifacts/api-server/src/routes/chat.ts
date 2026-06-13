import { Router } from "express";
import { engageraDb } from "../lib/supabase.js";
import { optionalAuth, type OptionalAuthRequest } from "../middlewares/optionalAuth.js";
import { routeChat } from "../lib/aiRouter.js";

const router = Router();

const GUEST_MESSAGE_LIMIT = 5;

/**
 * Upsert a guest session and return the current message count.
 * Returns null if the guest session ID is invalid.
 */
async function getOrCreateGuestSession(
  sessionId: string
): Promise<{ messageCount: number } | null> {
  const { data: existing } = await engageraDb
    .from("engagera_guest_sessions")
    .select("message_count")
    .eq("session_id", sessionId)
    .single();

  if (existing) return { messageCount: existing.message_count };

  const { data: created, error } = await engageraDb
    .from("engagera_guest_sessions")
    .insert({ session_id: sessionId, message_count: 0 })
    .select("message_count")
    .single();

  if (error || !created) return null;
  return { messageCount: created.message_count };
}

/**
 * Increment guest message count after a successful message.
 */
async function incrementGuestCount(sessionId: string): Promise<number> {
  const { data } = await engageraDb.rpc("engagera_increment_guest_count", {
    p_session_id: sessionId,
  });
  return (data as number) ?? 0;
}

/**
 * Get or create a conversation.
 * Returns the conversation ID.
 */
async function resolveConversation(opts: {
  conversationId?: number;
  userId?: string;
  guestSessionId?: string;
  model: string;
  firstUserMessage: string;
}): Promise<number> {
  const { conversationId, userId, guestSessionId, model, firstUserMessage } = opts;

  if (conversationId) return conversationId;

  const title = firstUserMessage.slice(0, 60).trim() || "New conversation";

  const insert: Record<string, unknown> = { title, model };
  if (userId) insert.user_id = userId;
  else insert.guest_session_id = guestSessionId;

  const { data, error } = await engageraDb
    .from("engagera_conversations")
    .insert(insert)
    .select("id")
    .single();

  if (error || !data) throw new Error("Failed to create conversation");
  return data.id;
}

/**
 * Save a message and increment the conversation's message_count.
 */
async function saveMessage(
  conversationId: number,
  role: "user" | "assistant",
  content: string,
  tokenCount = 0
): Promise<void> {
  await Promise.all([
    engageraDb.from("engagera_messages").insert({
      conversation_id: conversationId,
      role,
      content,
      token_count: tokenCount,
    }),
    engageraDb.rpc("engagera_increment_message_count", {
      p_conversation_id: conversationId,
    }),
  ]);
}

/**
 * POST /chat
 *
 * Accepts authenticated users (Bearer JWT) or guests (x-guest-session-id header).
 * Guests are limited to GUEST_MESSAGE_LIMIT messages across all sessions.
 * Saves every exchange to engagera_conversations + engagera_messages.
 */
router.post("/chat", optionalAuth, async (req: OptionalAuthRequest, res) => {
  const { messages, model = "engagera-pro", conversationId } = req.body ?? {};
  const { userId, guestSessionId } = req;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const validMessages = messages.filter(
    (m) =>
      m &&
      typeof m.role === "string" &&
      typeof m.content === "string" &&
      ["user", "assistant", "system"].includes(m.role)
  );

  if (validMessages.length === 0) {
    res.status(400).json({ error: "No valid messages provided" });
    return;
  }

  // ── Guest rate limiting ────────────────────────────────────────────────────
  let guestCount = 0;
  if (!userId) {
    if (!guestSessionId) {
      res.status(401).json({ error: "Authentication or guest session required" });
      return;
    }
    const session = await getOrCreateGuestSession(guestSessionId);
    if (!session) {
      res.status(400).json({ error: "Invalid guest session" });
      return;
    }
    guestCount = session.messageCount;
    if (guestCount >= GUEST_MESSAGE_LIMIT) {
      res.status(429).json({
        error: "GUEST_LIMIT_REACHED",
        guestMessageCount: guestCount,
        guestMessageLimit: GUEST_MESSAGE_LIMIT,
      });
      return;
    }
  }

  // ── AI completion ──────────────────────────────────────────────────────────
  const result = await routeChat(model, validMessages);
  const responseId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const userMessage = validMessages.find((m) => m.role === "user")?.content ?? "";

  // ── Resolve / create conversation ─────────────────────────────────────────
  let convId: number | undefined;
  try {
    convId = await resolveConversation({
      conversationId: typeof conversationId === "number" ? conversationId : undefined,
      userId,
      guestSessionId,
      model,
      firstUserMessage: userMessage,
    });

    const lastUserMsg = [...validMessages].reverse().find((m) => m.role === "user");
    if (lastUserMsg) {
      await saveMessage(convId, "user", lastUserMsg.content);
    }
    await saveMessage(convId, "assistant", result.content, result.totalTokens);

    await engageraDb
      .from("engagera_conversations")
      .update({ updated_at: new Date().toISOString(), model })
      .eq("id", convId);
  } catch (err) {
    req.log.warn({ err }, "Failed to save conversation (non-fatal)");
  }

  // ── Usage record (authenticated users only) ────────────────────────────────
  if (userId) {
    await engageraDb.from("engagera_usage_records").insert({
      user_id: userId,
      model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      total_tokens: result.totalTokens,
    });
  }

  // ── Guest: increment count ─────────────────────────────────────────────────
  let newGuestCount: number | undefined;
  if (!userId && guestSessionId) {
    newGuestCount = await incrementGuestCount(guestSessionId);
  }

  res.json({
    id: responseId,
    model,
    message: { role: "assistant", content: result.content },
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
    },
    conversationId: convId,
    ...(newGuestCount !== undefined && {
      guestMessageCount: newGuestCount,
      guestMessageLimit: GUEST_MESSAGE_LIMIT,
    }),
  });
});

export default router;
