import { Router } from "express";
import { engageraDb } from "../lib/supabase";
import { requireAuth, type AuthRequest } from "../middlewares/requireAuth";

const router = Router();

router.get("/dashboard/stats", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [keysResult, usageResult, recentResult] = await Promise.all([
    engageraDb
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    engageraDb
      .from("usage_records")
      .select("model, total_tokens")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString()),
    engageraDb
      .from("usage_records")
      .select("model, total_tokens, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const activeKeys = keysResult.count ?? 0;
  const usageRows = usageResult.data ?? [];
  const totalRequests = usageRows.length;
  const totalTokensThisMonth = usageRows.reduce((s, r) => s + r.total_tokens, 0);

  const modelCounts: Record<string, number> = {};
  for (const r of usageRows) {
    modelCounts[r.model] = (modelCounts[r.model] ?? 0) + 1;
  }
  const topModel =
    Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  res.json({
    activeKeys,
    totalRequests,
    totalTokensThisMonth,
    topModel,
    recentActivity: (recentResult.data ?? []).map((r) => ({
      model: r.model,
      tokens: r.total_tokens,
      createdAt: r.created_at,
    })),
  });
});

export default router;
