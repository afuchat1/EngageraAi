// Engagera Admin API — read-only surfaces for the Admin Dashboard.
// Everything here is gated behind requireAdmin (engagera_admins membership).
// Data domains stay strictly separated: dashboard chats, API logs, dataset
// candidates, knowledge base, training jobs and model registry never mix.
import { cors, json } from "../_shared/helpers.ts";
import { requireAdmin } from "../_shared/adminAuth.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function adminDb() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// Resolve a set of auth user IDs to emails via the Admin API (auth.users is
// not exposed through PostgREST). Fine at current platform scale — pulls the
// full user list once per request and filters in memory.
async function lookupEmails(
  db: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Map<string, string>> {
  const wanted = new Set(userIds);
  const emailById = new Map<string, string>();
  let page = 1;
  const perPage = 1000;
  while (emailById.size < wanted.size) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) break;
    for (const u of data.users) {
      if (wanted.has(u.id)) emailById.set(u.id, u.email ?? "(no email)");
    }
    if (data.users.length < perPage) break;
    page++;
  }
  return emailById;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const db = adminDb();
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/admin\/?/, "");

  // ── Dashboard overview ──────────────────────────────────────────────────
  if (path === "overview") {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [candidates, apiLogs, kb, models, jobs] = await Promise.all([
      db.from("engagera_dataset_candidates").select("reviewer_status"),
      db.from("engagera_api_logs").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
      db.from("engagera_knowledge_base").select("id", { count: "exact", head: true }),
      db.from("engagera_model_registry").select("model_key, deployment_status, training_status"),
      db.from("engagera_training_jobs").select("id", { count: "exact", head: true }).eq("status", "running"),
    ]);
    const byStatus = { pending: 0, approved: 0, rejected: 0 };
    for (const c of candidates.data ?? []) {
      const s = (c as { reviewer_status: string }).reviewer_status as keyof typeof byStatus;
      if (s in byStatus) byStatus[s]++;
    }
    return json({
      datasetCandidates: byStatus,
      apiRequests30d: apiLogs.count ?? 0,
      knowledgeBaseArticles: kb.count ?? 0,
      models: models.data ?? [],
      trainingJobsRunning: jobs.count ?? 0,
    });
  }

  // ── Single dataset candidate: /admin/dataset-candidate?id=123 ───────────
  if (path === "dataset-candidate") {
    const id = Number(url.searchParams.get("id"));
    if (!id) return json({ error: "id is required" }, 400);
    const { data, error } = await db.from("engagera_dataset_candidates").select("*").eq("id", id).maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!data) return json({ error: "Not found" }, 404);
    return json({ candidate: data });
  }

  // ── Dataset candidates: /admin/dataset-candidates?status=pending ───────
  if (path === "dataset-candidates") {
    const status = url.searchParams.get("status") ?? "pending";
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const { data, error } = await db
      .from("engagera_dataset_candidates")
      .select("*")
      .eq("reviewer_status", status)
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200));
    if (error) return json({ error: error.message }, 500);
    return json({ candidates: data });
  }

  // ── Dataset statistics: /admin/dataset-stats ────────────────────────────
  if (path === "dataset-stats") {
    const { data } = await db.from("engagera_dataset_candidates").select("reviewer_status, model, language, created_at");
    const rows = data ?? [];
    const byModel: Record<string, number> = {};
    const byLanguage: Record<string, number> = {};
    for (const r of rows as { model: string; language: string }[]) {
      byModel[r.model] = (byModel[r.model] ?? 0) + 1;
      byLanguage[r.language ?? "en"] = (byLanguage[r.language ?? "en"] ?? 0) + 1;
    }
    return json({ total: rows.length, byModel, byLanguage });
  }

  // ── Reviewer logs: /admin/reviewer-logs ─────────────────────────────────
  if (path === "reviewer-logs") {
    const limit = Number(url.searchParams.get("limit") ?? "50");
    const { data, error } = await db
      .from("engagera_reviewer_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(Math.min(limit, 200));
    if (error) return json({ error: error.message }, 500);
    return json({ logs: data });
  }

  // ── API analytics: /admin/api-analytics ─────────────────────────────────
  if (path === "api-analytics") {
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const { data, error } = await db
      .from("engagera_api_logs")
      .select("model, status_code, latency_ms, total_tokens, created_at")
      .gte("created_at", since.toISOString());
    if (error) return json({ error: error.message }, 500);
    const rows = (data ?? []) as { model: string; status_code: number; latency_ms: number; total_tokens: number }[];
    const byModel: Record<string, { requests: number; tokens: number; errors: number }> = {};
    let totalLatency = 0;
    for (const r of rows) {
      byModel[r.model] ??= { requests: 0, tokens: 0, errors: 0 };
      byModel[r.model].requests++;
      byModel[r.model].tokens += r.total_tokens ?? 0;
      if (r.status_code >= 400) byModel[r.model].errors++;
      totalLatency += r.latency_ms ?? 0;
    }
    return json({
      totalRequests: rows.length,
      avgLatencyMs: rows.length ? Math.round(totalLatency / rows.length) : 0,
      byModel,
    });
  }

  // ── Model registry: /admin/models ───────────────────────────────────────
  if (path === "models") {
    const { data, error } = await db.from("engagera_model_registry").select("*").order("model_key");
    if (error) return json({ error: error.message }, 500);
    return json({ models: data });
  }

  // ── Training jobs: /admin/training-jobs ─────────────────────────────────
  if (path === "training-jobs") {
    const { data, error } = await db
      .from("engagera_training_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) return json({ error: error.message }, 500);
    return json({ jobs: data });
  }

  // ── Dataset versions: /admin/dataset-versions ───────────────────────────
  if (path === "dataset-versions") {
    const { data, error } = await db
      .from("engagera_dataset_versions")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return json({ error: error.message }, 500);
    return json({ versions: data });
  }

  // ── Dataset file download: /admin/dataset-download?path=... ────────────
  if (path === "dataset-download") {
    const storagePath = url.searchParams.get("path");
    if (!storagePath) return json({ error: "path is required" }, 400);
    const { data, error } = await db.storage.from("datasets").createSignedUrl(storagePath, 300);
    if (error) return json({ error: error.message }, 500);
    return json({ url: data.signedUrl });
  }

  // ── Platform API keys: /admin/platform-api-keys ─────────────────────────
  // Every API key on the platform, across every user, with owner email and
  // lifetime + 30d token/request burn. Admin-only, unlike /api-keys (self-serve).
  if (path === "platform-api-keys") {
    const [{ data: keys, error: keysErr }, { data: allUsage }] = await Promise.all([
      db.from("engagera_api_keys")
        .select("id, user_id, name, prefix, is_active, paused_until, total_requests, last_used_at, created_at")
        .order("created_at", { ascending: false }),
      db.from("engagera_usage_records").select("api_key_id, total_tokens, created_at"),
    ]);
    if (keysErr) return json({ error: keysErr.message }, 500);

    const since30d = new Date();
    since30d.setDate(since30d.getDate() - 30);

    const tokensByKey: Record<number, { lifetime: number; last30d: number; requests30d: number }> = {};
    for (const r of (allUsage ?? []) as { api_key_id: number | null; total_tokens: number; created_at: string }[]) {
      if (r.api_key_id == null) continue;
      const bucket = (tokensByKey[r.api_key_id] ??= { lifetime: 0, last30d: 0, requests30d: 0 });
      bucket.lifetime += r.total_tokens ?? 0;
      if (new Date(r.created_at) >= since30d) {
        bucket.last30d += r.total_tokens ?? 0;
        bucket.requests30d++;
      }
    }

    const userIds = Array.from(new Set((keys ?? []).map((k) => k.user_id as string)));
    const emailById = await lookupEmails(db, userIds);

    const now = new Date();
    return json({
      keys: (keys ?? []).map((k) => {
        const usage = tokensByKey[k.id as number] ?? { lifetime: 0, last30d: 0, requests30d: 0 };
        const pausedUntil = k.paused_until as string | null;
        const isPaused = !!pausedUntil && new Date(pausedUntil) > now;
        return {
          id: k.id,
          name: k.name,
          prefix: k.prefix,
          ownerId: k.user_id,
          ownerEmail: emailById.get(k.user_id as string) ?? "unknown",
          isActive: k.is_active,
          isPaused,
          pausedUntil: isPaused ? pausedUntil : null,
          totalRequests: k.total_requests,
          requests30d: usage.requests30d,
          tokensLifetime: usage.lifetime,
          tokens30d: usage.last30d,
          lastUsedAt: k.last_used_at,
          createdAt: k.created_at,
        };
      }),
    });
  }

  // ── Platform users: /admin/platform-users ───────────────────────────────
  // One row per user who owns at least one API key, with aggregate burn.
  if (path === "platform-users") {
    const [{ data: keys, error: keysErr }, { data: allUsage }] = await Promise.all([
      db.from("engagera_api_keys").select("id, user_id, is_active, paused_until, created_at"),
      db.from("engagera_usage_records").select("user_id, total_tokens, created_at"),
    ]);
    if (keysErr) return json({ error: keysErr.message }, 500);

    const since30d = new Date();
    since30d.setDate(since30d.getDate() - 30);
    const now = new Date();

    const usageByUser: Record<string, { lifetime: number; last30d: number; requestsLifetime: number; requests30d: number }> = {};
    for (const r of (allUsage ?? []) as { user_id: string; total_tokens: number; created_at: string }[]) {
      const bucket = (usageByUser[r.user_id] ??= { lifetime: 0, last30d: 0, requestsLifetime: 0, requests30d: 0 });
      bucket.lifetime += r.total_tokens ?? 0;
      bucket.requestsLifetime++;
      if (new Date(r.created_at) >= since30d) {
        bucket.last30d += r.total_tokens ?? 0;
        bucket.requests30d++;
      }
    }

    const byUser: Record<string, { totalKeys: number; activeKeys: number; pausedKeys: number; oldestKeyAt: string }> = {};
    for (const k of (keys ?? []) as { user_id: string; is_active: boolean; paused_until: string | null; created_at: string }[]) {
      const bucket = (byUser[k.user_id] ??= { totalKeys: 0, activeKeys: 0, pausedKeys: 0, oldestKeyAt: k.created_at });
      bucket.totalKeys++;
      if (k.is_active) bucket.activeKeys++;
      if (k.paused_until && new Date(k.paused_until) > now) bucket.pausedKeys++;
      if (k.created_at < bucket.oldestKeyAt) bucket.oldestKeyAt = k.created_at;
    }

    const userIds = Object.keys(byUser);
    const emailById = await lookupEmails(db, userIds);

    return json({
      users: userIds.map((id) => ({
        userId: id,
        email: emailById.get(id) ?? "unknown",
        ...byUser[id],
        tokensLifetime: usageByUser[id]?.lifetime ?? 0,
        tokens30d: usageByUser[id]?.last30d ?? 0,
        requestsLifetime: usageByUser[id]?.requestsLifetime ?? 0,
        requests30d: usageByUser[id]?.requests30d ?? 0,
      })).sort((a, b) => b.requestsLifetime - a.requestsLifetime),
    });
  }

  // ── Platform-wide daily usage: /admin/platform-usage-daily ──────────────
  // Combined tokens/requests across every developer's usage, not per-key —
  // the platform-wide total the admin dashboard chart plots over time.
  if (path === "platform-usage-daily") {
    const days = Math.min(Number(url.searchParams.get("days") ?? "30"), 90);
    const since = new Date();
    since.setDate(since.getDate() - (days - 1));
    since.setHours(0, 0, 0, 0);

    const { data, error } = await db
      .from("engagera_usage_records")
      .select("total_tokens, created_at")
      .gte("created_at", since.toISOString());
    if (error) return json({ error: error.message }, 500);

    const byDay: Record<string, { tokens: number; requests: number }> = {};
    for (const r of (data ?? []) as { total_tokens: number; created_at: string }[]) {
      const day = r.created_at.slice(0, 10);
      const bucket = (byDay[day] ??= { tokens: 0, requests: 0 });
      bucket.tokens += r.total_tokens ?? 0;
      bucket.requests++;
    }

    const series = Array.from({ length: days }, (_, i) => {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      return { date: key, tokens: byDay[key]?.tokens ?? 0, requests: byDay[key]?.requests ?? 0 };
    });

    return json({
      series,
      totalTokens: series.reduce((s, d) => s + d.tokens, 0),
      totalRequests: series.reduce((s, d) => s + d.requests, 0),
    });
  }

  // ── Pause an API key: POST /admin/platform-api-keys/:id/pause ───────────
  if (req.method === "POST" && /^platform-api-keys\/\d+\/pause$/.test(path)) {
    const id = Number(path.split("/")[1]);
    const body = await req.json().catch(() => ({}));
    const minutes = Number(body.minutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      return json({ error: "minutes must be a positive number" }, 400);
    }
    const pausedUntil = new Date(Date.now() + minutes * 60_000).toISOString();
    const { error } = await db.from("engagera_api_keys").update({ paused_until: pausedUntil }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, pausedUntil });
  }

  // ── Unpause an API key: POST /admin/platform-api-keys/:id/unpause ───────
  if (req.method === "POST" && /^platform-api-keys\/\d+\/unpause$/.test(path)) {
    const id = Number(path.split("/")[1]);
    const { error } = await db.from("engagera_api_keys").update({ paused_until: null }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true });
  }

  // ── Revoke/reactivate an API key: POST /admin/platform-api-keys/:id/{revoke|reactivate}
  if (req.method === "POST" && /^platform-api-keys\/\d+\/(revoke|reactivate)$/.test(path)) {
    const segs = path.split("/");
    const id = Number(segs[1]);
    const isActive = segs[2] === "reactivate";
    const { error } = await db.from("engagera_api_keys").update({ is_active: isActive }).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    return json({ success: true, isActive });
  }

  // ── System health: /admin/system-health ─────────────────────────────────
  if (path === "system-health") {
    const since = new Date();
    since.setHours(since.getHours() - 24);
    const [errors, requests] = await Promise.all([
      db.from("engagera_api_logs").select("id", { count: "exact", head: true }).gte("status_code", 400).gte("created_at", since.toISOString()),
      db.from("engagera_api_logs").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
    ]);
    const total = requests.count ?? 0;
    const failed = errors.count ?? 0;
    return json({
      requests24h: total,
      errors24h: failed,
      errorRate: total ? Math.round((failed / total) * 1000) / 10 : 0,
      status: total === 0 ? "idle" : failed / Math.max(total, 1) > 0.1 ? "degraded" : "healthy",
    });
  }

  return json({ error: "Not found" }, 404);
});
