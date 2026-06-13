import { Router, Request, Response } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

router.post("/chat", async (req: Request, res: Response) => {
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
