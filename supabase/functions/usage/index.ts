import { cors, json, adminDb, requireAuth } from "../_shared/helpers.ts";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();

  const auth = await requireAuth(req);
  if (auth instanceof Response) return auth;
  const { userId } = auth;

  const db = adminDb();
  const url = new URL(req.url);
  const isSummary = url.pathname.endsWith("/summary");

  if (isSummary) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data, error } = await db
      .from("engagera_usage_records")
      .select("model, input_tokens, output_tokens, total_tokens, created_at")
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());

    if (error) return json({ error: error.message }, 500);

    type Row = {
      model: string;
      input_tokens: number;
      output_tokens: number;
      total_tokens: number;
      created_at: string;
    };
    const records = (data ?? []) as Row[];
    const totalRequests    = records.length;
    const totalTokens      = records.reduce((s, r) => s + r.total_tokens,      0);
    const totalInputTokens = records.reduce((s, r) => s + r.input_tokens,  0);
    const totalOutputTokens = records.reduce((s, r) => s + r.output_tokens, 0);

    const byModelMap: Record<string, { requests: number; tokens: number }> = {};
    const dailyMap:   Record<string, { requests: number; tokens: number }> = {};

    for (const r of records) {
      if (!byModelMap[r.model]) byModelMap[r.model] = { requests: 0, tokens: 0 };
      byModelMap[r.model].requests++;
      byModelMap[r.model].tokens += r.total_tokens;

      const day = r.created_at.slice(0, 10);
      if (!dailyMap[day]) dailyMap[day] = { requests: 0, tokens: 0 };
      dailyMap[day].requests++;
      dailyMap[day].tokens += r.total_tokens;
    }

    return json({
      totalRequests,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      byModel: Object.entries(byModelMap).map(([model, v]) => ({ model, ...v })),
      dailyUsage: Object.entries(dailyMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, ...v })),
    });
  }

  // ── Detailed records list ──────────────────────────────────────────────────
  const days  = parseInt(url.searchParams.get("days") ?? "30", 10);
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await db
    .from("engagera_usage_records")
    .select("id, model, input_tokens, output_tokens, total_tokens, created_at, api_key_id")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return json({ error: error.message }, 500);

  type Row = {
    id: number;
    model: string;
    input_tokens: number;
    output_tokens: number;
    total_tokens: number;
    created_at: string;
    api_key_id: number | null;
  };

  const rows = (data ?? []) as Row[];

  // Resolve API key names for records that came from a key, not a JWT session.
  const keyIds = [...new Set(rows.map(r => r.api_key_id).filter((id): id is number => id != null))];
  let keyNameById: Record<number, string> = {};

  if (keyIds.length > 0) {
    const { data: keys } = await db
      .from("engagera_api_keys")
      .select("id, name, prefix")
      .in("id", keyIds);

    for (const k of (keys ?? []) as Array<{ id: number; name: string; prefix: string }>) {
      // Display as "Name (eng_xxxx...)" so users can identify which key
      keyNameById[k.id] = k.name ? `${k.name} (${k.prefix}…)` : k.prefix;
    }
  }

  return json(
    rows.map(r => ({
      id:           r.id,
      model:        r.model,
      inputTokens:  r.input_tokens,
      outputTokens: r.output_tokens,
      totalTokens:  r.total_tokens,
      createdAt:    r.created_at,
      apiKeyId:     r.api_key_id,
      apiKeyName:   r.api_key_id != null ? (keyNameById[r.api_key_id] ?? `key #${r.api_key_id}`) : null,
    })),
  );
});
