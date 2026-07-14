// Engagera AI Reviewer — scores Dataset Candidates and approves / rejects /
// holds-for-review them.
//
// Two-stage pipeline:
//   1. Deterministic heuristics (length, profanity, exact-duplicate hash,
//      canned refusal/hallucination phrases) — these produce instant,
//      confident rejects. They never approve on their own.
//   2. An LLM judge (Groq, JSON-mode) independently fact-checks and
//      quality-checks every candidate that survives stage 1. It is
//      instructed to be conservative: only approve when it is confident the
//      response is correct, safe, and non-garbage; reject when confidently
//      false/harmful/garbage; otherwise hold for manual review.
//
// Nothing is auto-approved on heuristics alone — bad automatic approval
// poisons the training set, so the default on any uncertainty is
// "pending" (manual review), never "approved".
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

interface HeuristicResult {
  quality: number;
  safety: number;
  hallucination: number;
  /** Set when the heuristics alone are confident enough to reject outright. */
  hardReject: string | null;
}

function scoreHeuristics(request: string, response: string): HeuristicResult {
  const text = `${request}\n${response}`.toLowerCase();
  const respLen = response.trim().length;

  let hardReject: string | null = null;

  // Quality: penalize very short, empty, or very repetitive responses
  let quality = 100;
  if (respLen === 0) { quality = 0; hardReject = "empty response"; }
  else if (respLen < 20) quality -= 60;
  else if (respLen < 60) quality -= 20;
  const words = response.toLowerCase().split(/\s+/).filter(Boolean);
  const uniqueRatio = words.length ? new Set(words).size / words.length : 0;
  if (words.length > 20 && uniqueRatio < 0.4) {
    quality -= 30;
    if (uniqueRatio < 0.25) hardReject = "degenerate/repetitive text";
  }
  quality = Math.max(0, Math.min(100, quality));

  // Safety: penalize profanity / harmful markers
  let safety = 100;
  for (const w of PROFANITY) if (text.includes(w)) safety -= 40;
  safety = Math.max(0, safety);
  if (safety <= 20) hardReject = hardReject ?? "unsafe/profane content";

  // Hallucination: penalize canned refusal / stale-knowledge disclaimers
  let hallucination = 100;
  for (const p of [...REFUSAL_PHRASES, ...HALLUCINATION_MARKERS]) {
    if (text.includes(p)) hallucination -= 25;
  }
  hallucination = Math.max(0, hallucination);

  return { quality, safety, hallucination, hardReject };
}

interface JudgeResult {
  verdict: "approve" | "reject" | "review";
  confidence: number; // 0-100
  reason: string;
  factually_correct: boolean;
  ran: boolean; // false if the judge call itself failed (treated as "review")
}

const JUDGE_SYSTEM_PROMPT = `You are a strict, skeptical data-quality reviewer for an AI training dataset. You will be shown a user request and an AI-generated response that answered it. Your job is to decide whether this exchange is GOOD ENOUGH to train a future model on.

Be conservative. Bad training data (wrong facts, made-up information, unsafe content, incoherent text) is worse than no data — it teaches the model to be confidently wrong. Only approve when you are genuinely confident the response is factually correct (or, for non-factual requests like creative writing/code/opinions, that it is coherent, on-topic, and high quality), safe, and not garbage.

Rules:
- If the response contains information you cannot verify or that seems fabricated/hallucinated (invented facts, fake citations, wrong dates, wrong numbers, invented events), do NOT approve it.
- If the response is off-topic, incoherent, cut off mid-thought, or does not actually answer the request, reject it.
- If the response is harmful, unsafe, or promotes illegal activity, reject it.
- If you are unsure — the claim is plausible but you cannot confirm it, or quality is borderline — mark it "review" so a human decides. Never approve just because something "sounds right".
- For creative writing, opinions, code, or subjective requests, judge coherence/quality/correctness of code logic instead of "verifiable facts", but still hold to a high bar.

Respond with ONLY a compact JSON object, no prose, no markdown fences:
{"verdict":"approve"|"reject"|"review","confidence":0-100,"factually_correct":true|false,"reason":"one short sentence"}`;

async function judgeCandidate(request: string, response: string): Promise<JudgeResult> {
  const key = Deno.env.get("GROQ_API_KEY");
  const fallback: JudgeResult = { verdict: "review", confidence: 0, reason: "judge unavailable", factually_correct: false, ran: false };
  if (!key) return fallback;

  try {
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        temperature: 0,
        max_tokens: 300,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: JUDGE_SYSTEM_PROMPT },
          { role: "user", content: `REQUEST:\n${request.slice(0, 4000)}\n\nRESPONSE:\n${response.slice(0, 6000)}` },
        ],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return fallback;
    const data = await resp.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) return fallback;
    const parsed = JSON.parse(content);
    const verdict = ["approve", "reject", "review"].includes(parsed.verdict) ? parsed.verdict : "review";
    const confidence = typeof parsed.confidence === "number" ? Math.max(0, Math.min(100, parsed.confidence)) : 0;
    return {
      verdict, confidence,
      reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 300) : "",
      factually_correct: !!parsed.factually_correct,
      ran: true,
    };
  } catch {
    return fallback;
  }
}

// Minimum judge confidence required to trust an "approve" verdict outright.
const APPROVE_CONFIDENCE_FLOOR = 80;

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
      const request = c.request as string;
      const response = c.response as string;
      const heuristics = scoreHeuristics(request, response);

      let duplicate = 100;
      if (c.content_hash) {
        const { count } = await db
          .from("engagera_dataset_candidates")
          .select("id", { count: "exact", head: true })
          .eq("content_hash", c.content_hash)
          .neq("id", c.id);
        if ((count ?? 0) > 0) duplicate = 0;
      }

      let status: "approved" | "pending" | "rejected";
      let judge: JudgeResult | null = null;
      let notes: string;

      if (heuristics.hardReject) {
        // Deterministic reject — no need to spend an LLM call.
        status = "rejected";
        notes = `Auto-rejected: ${heuristics.hardReject}`;
      } else if (duplicate === 0) {
        status = "rejected";
        notes = "Auto-rejected: exact duplicate of an existing candidate";
      } else {
        judge = await judgeCandidate(request, response);
        if (!judge.ran) {
          // Judge unreachable — never approve blind; hold for a human.
          status = "pending";
          notes = "Held for manual review: AI judge unavailable";
        } else if (judge.verdict === "reject") {
          status = "rejected";
          notes = `Auto-rejected by AI judge: ${judge.reason}`;
        } else if (judge.verdict === "approve" && judge.confidence >= APPROVE_CONFIDENCE_FLOOR && judge.factually_correct) {
          status = "approved";
          notes = `Auto-approved by AI judge (confidence ${judge.confidence}): ${judge.reason}`;
        } else {
          status = "pending";
          notes = `Held for manual review (judge verdict "${judge.verdict}", confidence ${judge.confidence}): ${judge.reason}`;
        }
      }

      if (status === "approved") approved++;
      else if (status === "rejected") rejected++;
      else pending++;

      const update: Record<string, unknown> = {
        quality_score: heuristics.quality, safety_score: heuristics.safety,
        duplicate_score: duplicate, hallucination_score: heuristics.hallucination,
        reviewer_status: status,
        reviewer_notes: notes,
      };
      if (status === "approved") update.approved_at = new Date().toISOString();

      await db.from("engagera_dataset_candidates").update(update).eq("id", c.id);
      await db.from("engagera_reviewer_logs").insert({
        candidate_id: c.id, reviewer: "ai", decision: status,
        scores: {
          quality: heuristics.quality, safety: heuristics.safety, duplicate,
          hallucination: heuristics.hallucination,
          judge_verdict: judge?.verdict ?? null,
          judge_confidence: judge?.confidence ?? null,
        },
        notes,
      });
    }

    return json({ processed: (candidates ?? []).length, approved, pending, rejected });
  }

  return json({ error: "Not found" }, 404);
});
