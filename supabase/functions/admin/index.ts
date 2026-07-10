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
