import { Router } from "express";
import { engageraDb } from "../lib/supabase.js";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;

const GUEST_DAILY_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /chat
 *
 * Guest 24-hour enforcement (server-side, cannot be bypassed by the client):
 *   1. Guests are identified by x-guest-session-id header.
 *   2. Each session gets GUEST_DAILY_LIMIT messages per 24-hour rolling window.
 *   3. When the window expires the counter is reset automatically.
 *   4. Authenticated users (Authorization header) bypass this check entirely.
 *
 * After the guard, the request is proxied to the Supabase "chat" Edge Function
 * which holds OPENROUTER_API_KEY in its Edge Function secrets.
 */
router.post("/chat", async (req, res) => {
  const { messages, model, conversationId } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const guestSessionId = req.headers["x-guest-session-id"];
  const isGuest = !req.headers.authorization && typeof guestSessionId === "string" && guestSessionId.length > 0;

  if (isGuest) {
    const sessionId = guestSessionId as string;
    const now = new Date();

    const { data: session } = await engageraDb
      .from("engagera_guest_sessions")
      .select("message_count, window_start")
      .eq("session_id", sessionId)
      .single();

    if (!session) {
      await engageraDb.from("engagera_guest_sessions").insert({
        session_id: sessionId,
        message_count: 0,
        window_start: now.toISOString(),
        last_seen_at: now.toISOString(),
      });
    } else {
      const windowStart = new Date(session.window_start);
      const windowAge = now.getTime() - windowStart.getTime();

      if (windowAge >= WINDOW_MS) {
        await engageraDb
          .from("engagera_guest_sessions")
          .update({ message_count: 0, window_start: now.toISOString(), last_seen_at: now.toISOString() })
          .eq("session_id", sessionId);
      } else if (session.message_count >= GUEST_DAILY_LIMIT) {
        const windowResetAt = new Date(windowStart.getTime() + WINDOW_MS);
        res.status(429).json({
          error: "DAILY_LIMIT_REACHED",
          windowResetAt: windowResetAt.toISOString(),
          guestMessageCount: session.message_count,
          guestMessageLimit: GUEST_DAILY_LIMIT,
        });
        return;
      }
    }
  }

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };

  const authHeader = req.headers.authorization;
  if (authHeader) forwardHeaders["Authorization"] = authHeader;

  const guestHeader = req.headers["x-guest-session-id"];
  if (guestHeader && typeof guestHeader === "string") {
    forwardHeaders["x-guest-session-id"] = guestHeader;
  }

  const upstream = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: forwardHeaders,
    body: JSON.stringify({ messages, model, conversationId }),
  });

  const data = await upstream.json();
  res.status(upstream.status).json(data);
});

export default router;
