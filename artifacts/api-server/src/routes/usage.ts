import { Router } from "express";
import { engageraDb } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/usage", requireAuth, async (req: AuthRequest, res) => {
  const days = Number(req.query.days ?? 30);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await engageraDb
    .from("engagera_usage_records")
    .select(
      "id, model, input_tokens, output_tokens, total_tokens, created_at, api_key_id",
    )
    .eq("user_id", req.userId!)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.json(
    (data ?? []).map((r) => ({
      id: r.id,
      model: r.model,
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      totalTokens: r.total_tokens,
      createdAt: r.created_at,
      apiKeyName: null,
    })),
  );
});

router.get("/usage/summary", requireAuth, async (req: AuthRequest, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data, error } = await engageraDb
    .from("engagera_usage_records")
    .select("model, input_tokens, output_tokens, total_tokens, created_at")
    .eq("user_id", req.userId!)
    .gte("created_at", since.toISOString());

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  const records = data ?? [];
  const totalRequests = records.length;
  const totalTokens = records.reduce((s, r) => s + r.total_tokens, 0);
  const totalInputTokens = records.reduce((s, r) => s + r.input_tokens, 0);
  const totalOutputTokens = records.reduce((s, r) => s + r.output_tokens, 0);

  const byModelMap: Record<string, { requests: number; tokens: number }> = {};
  const dailyMap: Record<string, { requests: number; tokens: number }> = {};

  for (const r of records) {
    if (!byModelMap[r.model]) byModelMap[r.model] = { requests: 0, tokens: 0 };
    byModelMap[r.model].requests++;
    byModelMap[r.model].tokens += r.total_tokens;

    const day = r.created_at.slice(0, 10);
    if (!dailyMap[day]) dailyMap[day] = { requests: 0, tokens: 0 };
    dailyMap[day].requests++;
    dailyMap[day].tokens += r.total_tokens;
  }

  res.json({
    totalRequests,
    totalTokens,
    totalInputTokens,
    totalOutputTokens,
    byModel: Object.entries(byModelMap).map(([model, v]) => ({ model, ...v })),
    dailyUsage: Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
  });
});

export default router;
