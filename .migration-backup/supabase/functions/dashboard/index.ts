import { cors, json, adminDb, requireAuth } from "../_shared/helpers.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const db = adminDb();
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [keysResult, usageResult, recentResult] = await Promise.all([
    db.from("engagera_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_active", true),
    db.from("engagera_usage_records")
      .select("model, total_tokens")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString()),
    db.from("engagera_usage_records")
      .select("model, total_tokens, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  const activeKeys = keysResult.count ?? 0;
  const usageRows = usageResult.data ?? [];
  const totalRequests = usageRows.length;
  const totalTokensThisMonth = usageRows.reduce((s: number, r: { total_tokens: number }) => s + r.total_tokens, 0);

  const modelCounts: Record<string, number> = {};
  for (const r of usageRows) {
    modelCounts[(r as { model: string }).model] = (modelCounts[(r as { model: string }).model] ?? 0) + 1;
  }
  const topModel = Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  return json({
    activeKeys,
    totalRequests,
    totalTokensThisMonth,
    topModel,
    recentActivity: (recentResult.data ?? []).map((r: { model: string; total_tokens: number; created_at: string }) => ({
      model: r.model, tokens: r.total_tokens, createdAt: r.created_at,
    })),
  });
});
