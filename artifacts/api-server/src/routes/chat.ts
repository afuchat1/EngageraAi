import { Router } from "express";

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL!;
const EDGE_FUNCTION_URL = `${SUPABASE_URL}/functions/v1/chat`;

/**
 * POST /chat
 *
 * Thin proxy to the Supabase "chat" Edge Function which:
 *  - Authenticates the caller (Bearer JWT or x-guest-session-id)
 *  - Calls OpenRouter using the OPENROUTER_API_KEY stored in Edge Function secrets
 *  - Persists conversation & messages to engagera_* tables
 *  - Enforces the guest message limit
 *
 * All business logic lives in supabase/functions/chat/index.ts so that the
 * secret never has to leave Supabase's secure environment.
 */
router.post("/chat", async (req, res) => {
  const { messages, model, conversationId } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
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
