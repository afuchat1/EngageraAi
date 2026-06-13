import { Router } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

/**
 * POST /chat
 *
 * Thin proxy to the Supabase "chat" Edge Function.
 * All business logic — guest rate limiting, conversation persistence,
 * usage tracking, and the OpenRouter AI call — lives in the Edge Function.
 * The service-role key never touches the Express layer.
 */
router.post("/chat", async (req, res) => {
  const { messages, model, conversationId, contextHint } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  await proxyToEdge(req, res, edgeFnUrl("chat"), {
    messages,
    model,
    conversationId,
    contextHint,
  });
});

export default router;
