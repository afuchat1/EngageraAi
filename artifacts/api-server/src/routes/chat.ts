import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const chatHandler: RequestHandler = async (req, res) => {
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
};

router.post("/chat", chatHandler);

export default router;
