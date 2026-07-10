// Engagera AI Reviewer — automatically scores Dataset Candidates and
// approves / rejects / holds-for-review them. No third-party AI call is
// required: uses fast heuristics (length, profanity, duplicate hash,
// refusal/hallucination phrases, grammar signal) to produce a confidence
// score in [0,100] per dimension.
//
// POST /reviewer/run   { limit?: number }   — admin only, processes a batch of pending candidates
// PATCH /reviewer/:id  { status, notes }    — admin only, manual override
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

const PROFANITY = ["fuck", "shit", "bitch", "asshole", "cunt", "nigger", "faggot"];
const REFUSAL_PHRASES = [
  "i cannot help with that", "i can't help with that", "as an ai language model",
  "i don't have access to real-time", "i cannot provide", "i'm not able to",
];
const HALLUCINATION_MARKERS = [
  "as of my last update", "i don't have real-time", "i cannot browse the internet",
];

function scoreCandidate(request: string, response: string) {
  const text = `${request}\n${response}`.toLowerCase();
  const respLen = response.trim().length;

  // Quality: penalize very short or very repetitive responses
  let quality = 100;
  if (respLen < 20) quality -= 60;
  else if (respLen < 60) quality -= 20;
  const words = response.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
  if (words.length > 20 && uniqueRatio < 0.4) quality -= 30;
  quality = Math.max(0, Math.min(100, quality));

  // Safety: penalize profanity / harmful markers
  let safety = 100;
  for (const w of PROFANITY) if (text.includes(w)) safety -= 40;
  safety = Math.max(0, safety);

  // Hallucination: penalize canned refusal / stale-knowledge disclaimers
  let hallucination = 100;
  for (const p of [...REFUSAL_PHRASES, ...HALLUCINATION_MARKERS]) {
    if (text.includes(p)) hallucination -= 25;
  }
  hallucination = Math.max(0, hallucination);

  return { quality, safety, hallucination };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return cors();
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/reviewer\/?/, "").split("/").filter(Boolean);

  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const db = adminDb();

  // Manual override: PATCH /reviewer/:id
  if (req.method === "PATCH" && segments[0]) {
    const id = Number(segments[0]);
    let body: { status?: string; notes?: string } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const status = body.status;
    if (!["approved", "rejected", "pending"].includes(status ?? "")) {
      return json({ error: "status must be approved | rejected | pending" }, 400);
    }
    const update: Record<string, unknown> = { reviewer_status: status, reviewer_notes: body.notes ?? null };
    if (status === "approved") update.approved_at = new Date().toISOString();
    const { error } = await db.from("engagera_dataset_candidates").update(update).eq("id", id);
    if (error) return json({ error: error.message }, 500);
    await db.from("engagera_reviewer_logs").insert({
      candidate_id: id, reviewer: "admin", decision: status, scores: {}, notes: body.notes ?? null,
    });
    return json({ ok: true });
  }

  // Batch run: POST /reviewer/run
  if (req.method === "POST") {
    let body: { limit?: number } = {};
    try { body = await req.json(); } catch { /* empty body ok */ }
    const limit = Math.min(body.limit ?? 50, 200);

    const { data: candidates, error } = await db
      .from("engagera_dataset_candidates")
      .select("id, request, response, content_hash")
      .eq("reviewer_status", "pending")
      .limit(limit);
    if (error) return json({ error: error.message }, 500);

    let approved = 0, rejected = 0, pending = 0;
    for (const c of candidates ?? []) {
      const { quality, safety, hallucination } = scoreCandidate(c.request as string, c.response as string);

      let duplicate = 100;
      if (c.content_hash) {
        const { count } = await db
          .from("engagera_dataset_candidates")
          .select("id", { count: "exact", head: true })
          .eq("content_hash", c.content_hash)
          .neq("id", c.id);
        if ((count ?? 0) > 0) duplicate = 0;
      }

      const confidence = quality * 0.4 + safety * 0.3 + hallucination * 0.2 + duplicate * 0.1;
      let status: "approved" | "pending" | "rejected";
      if (confidence >= 75) { status = "approved"; approved++; }
      else if (confidence >= 45) { status = "pending"; pending++; }
      else { status = "rejected"; rejected++; }

      const update: Record<string, unknown> = {
        quality_score: quality, safety_score: safety,
        duplicate_score: duplicate, hallucination_score: hallucination,
        reviewer_status: status,
      };
      if (status === "approved") update.approved_at = new Date().toISOString();

      await db.from("engagera_dataset_candidates").update(update).eq("id", c.id);
      await db.from("engagera_reviewer_logs").insert({
        candidate_id: c.id, reviewer: "ai", decision: status,
        scores: { quality, safety, duplicate, hallucination, confidence: Math.round(confidence) },
      });
    }

    return json({ processed: (candidates ?? []).length, approved, pending, rejected });
  }

  return json({ error: "Not found" }, 404);
});
