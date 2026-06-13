import { Router } from "express";
import { engageraDb } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";
import { routeChat } from "../lib/aiRouter";

const router = Router();

router.post("/chat", requireAuth, async (req: AuthRequest, res) => {
  const { messages, model = "engagera-pro" } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const validMessages = messages.filter(
    (m) =>
      m &&
      typeof m.role === "string" &&
      typeof m.content === "string" &&
      ["user", "assistant", "system"].includes(m.role),
  );

  if (validMessages.length === 0) {
    res.status(400).json({ error: "No valid messages provided" });
    return;
  }

  const result = await routeChat(model, validMessages);

  const responseId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  await engageraDb
    .from("usage_records")
    .insert({
      user_id: req.userId!,
      model,
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
      total_tokens: result.totalTokens,
    });

  res.json({
    id: responseId,
    model,
    message: { role: "assistant", content: result.content },
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.totalTokens,
    },
  });
});

export default router;
