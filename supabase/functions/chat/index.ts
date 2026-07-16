import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function — clean rewrite (2026-07-16)
 *
 * Fixed boot issues from previous version:
 *  1. Removed static WASM imports (deno_dom, imagescript) — now lazy dynamic imports
 *  2. Removed top-level toLocaleString("en-GB",...) calls — Supabase Deno runtime
 *     lacks full ICU data; these threw RangeError at module init, crashing the isolate
 *  3. Moved system prompt date injection into the request handler (not module init)
 *
 * Provider chain (tried in order):
 *   1. Groq   — llama-3.3-70b-versatile  (primary)
 *   2. Groq   — llama-3.1-8b-instant     (fallback, separate rate-limit bucket)
 *   3. Cerebras — gpt-oss-120b
 *   4. Cloudflare Workers AI — llama-3.3-70b-instruct-fp8-fast
 */

// ── Provider URLs ─────────────────────────────────────────────────────────────
const GROQ_URL       = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_URL   = "https://api.cerebras.ai/v1/chat/completions";
const CF_BASE        = "https://api.cloudflare.com/client/v4/accounts";

const GUEST_LIMIT = 5;

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-session-id, x-engagera-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) {
  const entry = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type MessageContent = string | ContentPart[];

interface IncomingMessage {
  role: string;
  content: MessageContent;
}

interface ChatMessage {
  role: string;
  content: string;
}

interface AIResult {
  ok: boolean;
  content: string;
  inputTokens: number;
  outputTokens: number;
  provider?: string;
  model?: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? "";
}

function toChat(msgs: IncomingMessage[]): ChatMessage[] {
  return msgs
    .filter((m) => ["user", "assistant", "system"].includes(m.role))
    .map((m) => ({ role: m.role, content: getTextContent(m.content) }));
}

// ── OpenAI-compatible call ────────────────────────────────────────────────────
async function callOAI(
  url: string,
  key: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  providerName: string,
  extraHeaders?: Record<string, string>,
): Promise<AIResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(extraHeaders ?? {}),
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("warn", `${providerName}.http_error`, { requestId, status: res.status, err: err.slice(0, 200) });
      return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    log("info", `${providerName}.success`, { requestId, model, inputTokens, outputTokens });
    return { ok: true, content, inputTokens, outputTokens, provider: providerName, model };
  } catch (err) {
    log("warn", `${providerName}.error`, { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: String(err) };
  }
}

// ── Cloudflare Workers AI call ────────────────────────────────────────────────
async function callCloudflare(
  token: string,
  accountId: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
): Promise<AIResult> {
  const url = `${CF_BASE}/${accountId}/ai/run/${model}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("warn", "cloudflare.http_error", { requestId, status: res.status, err: err.slice(0, 200) });
      return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: `HTTP ${res.status}` };
    }
    const data = await res.json() as { success?: boolean; result?: { response?: string }; errors?: { message?: string }[] };
    if (!data.success) {
      const err = data.errors?.map((e) => e.message).join("; ") ?? "unknown";
      log("warn", "cloudflare.api_error", { requestId, error: err });
      return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: err };
    }
    const content = data.result?.response ?? "";
    log("info", "cloudflare.success", { requestId, model, len: content.length });
    return { ok: true, content, inputTokens: 0, outputTokens: 0, provider: "cloudflare", model };
  } catch (err) {
    log("warn", "cloudflare.error", { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: String(err) };
  }
}

// ── Provider chain ────────────────────────────────────────────────────────────
async function callWithFallback(
  messages: ChatMessage[],
  keys: { groq?: string; cerebras?: string; cloudflare?: string; cloudflareAccountId?: string },
  maxTokens: number,
  requestId: string,
): Promise<AIResult> {
  // 1. Groq (primary — llama-3.3-70b)
  if (keys.groq) {
    const r = await callOAI(GROQ_URL, keys.groq, "llama-3.3-70b-versatile", messages, maxTokens, requestId, "groq");
    if (r.ok) return r;
  }
  // 2. Groq (secondary model — separate rate-limit bucket)
  if (keys.groq) {
    const r = await callOAI(GROQ_URL, keys.groq, "llama-3.1-8b-instant", messages, maxTokens, requestId, "groq-lite");
    if (r.ok) return r;
  }
  // 3. Cerebras
  if (keys.cerebras) {
    const r = await callOAI(CEREBRAS_URL, keys.cerebras, "gpt-oss-120b", messages, maxTokens, requestId, "cerebras");
    if (r.ok) return r;
  }
  // 4. Cloudflare Workers AI (genuinely free, no billing)
  if (keys.cloudflare && keys.cloudflareAccountId) {
    const r = await callCloudflare(
      keys.cloudflare, keys.cloudflareAccountId,
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
      messages, maxTokens, requestId,
    );
    if (r.ok) return r;
  }
  return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: "all providers failed" };
}

// ── Simple web search (DuckDuckGo, no API key) ────────────────────────────────
async function webSearch(query: string, requestId: string): Promise<string> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!res.ok) return "";
    const html = await res.text();
    const snippets: string[] = [];
    const re = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && snippets.length < 5) {
      const text = m[1].replace(/<[^>]+>/g, "").trim();
      if (text.length > 20) snippets.push(text);
    }
    log("info", "search.done", { requestId, results: snippets.length });
    return snippets.length ? `Search results for "${query}":\n${snippets.map((s, i) => `${i + 1}. ${s}`).join("\n")}` : "";
  } catch {
    return "";
  }
}

// ── Detect if the user is asking a web-search-worthy question ─────────────────
function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase();
  const triggers = [
    "latest", "recent", "today", "news", "current", "now", "2024", "2025", "2026",
    "price", "score", "result", "weather", "stock", "live",
    "who won", "what happened", "when did", "where is",
  ];
  return triggers.some((t) => lower.includes(t));
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function resolveAuth(
  req: Request,
  db: ReturnType<typeof createClient>,
  requestId: string,
): Promise<
  | { type: "api_key"; userId?: string; apiKeyId: number }
  | { type: "user"; userId: string }
  | { type: "guest"; guestSessionId: string }
  | { type: "none" }
> {
  // 1. Engagera API key
  const apiKeyHeader = req.headers.get("x-engagera-api-key");
  if (apiKeyHeader?.startsWith("eng_")) {
    const keyHash = Array.from(
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKeyHeader))),
    ).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: keyRow } = await db
      .from("engagera_api_keys")
      .select("id, user_id, is_active, daily_limit, usage_count")
      .eq("key_hash", keyHash)
      .single();

    if (keyRow?.is_active) {
      log("info", "auth.api_key", { requestId, keyId: keyRow.id });
      return { type: "api_key", userId: keyRow.user_id, apiKeyId: keyRow.id };
    }
    return { type: "none" };
  }

  // 2. JWT Bearer
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await db.auth.getUser(token);
    if (data.user) {
      log("info", "auth.jwt", { requestId, userId: data.user.id });
      return { type: "user", userId: data.user.id };
    }
  }

  // 3. Guest session
  const guestId = req.headers.get("x-guest-session-id")?.trim();
  if (guestId) {
    return { type: "guest", guestSessionId: guestId };
  }

  return { type: "none" };
}

// ── Guest rate-limit check ────────────────────────────────────────────────────
async function checkGuestLimit(
  db: ReturnType<typeof createClient>,
  guestSessionId: string,
): Promise<{ allowed: boolean; count: number }> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db
    .from("guest_usage_tracking")
    .select("message_count, window_start")
    .eq("session_id", guestSessionId)
    .single();

  if (error || !data) {
    return { allowed: true, count: 0 };
  }
  if (data.window_start < windowStart) {
    // Window expired — reset
    return { allowed: true, count: 0 };
  }
  return { allowed: data.message_count < GUEST_LIMIT, count: data.message_count };
}

async function incrementGuestCount(
  db: ReturnType<typeof createClient>,
  guestSessionId: string,
): Promise<number> {
  try {
    const { data } = await db.rpc("engagera_increment_guest_count", { p_session_id: guestSessionId });
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(mode: string): string {
  // Date is computed inside the handler (at request time), not at module init.
  // This avoids any ICU/locale issues at cold-start.
  const dateStr = new Date().toISOString().slice(0, 10);

  if (mode === "dev") {
    return `You are Engagera Dev, an expert software engineering assistant built by AfuAI, the AI division of AfuChat Technologies Limited. Help users build production-quality software. Current date: ${dateStr}.`;
  }
  return `You are Engagera — an advanced AI assistant built by AfuAI (AfuChat Technologies Limited). You are knowledgeable, fluent, and capable across a wide range of tasks. You give clear, accurate, direct answers. You have real-time web search when needed. Never say you don't have access to the internet or can't check current events. Current date: ${dateStr}.`;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const requestId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  try {
    // Read env vars inside handler (not at module level)
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      log("error", "handler.missing_env", { requestId });
      return json({ error: "Server misconfiguration" }, 500);
    }

    const keys = {
      groq:                Deno.env.get("GROQ_API_KEY")         || undefined,
      cerebras:            Deno.env.get("CEREBRAS_API_KEY")      || undefined,
      cloudflare:          Deno.env.get("CLOUDFLARE_API_TOKEN")  || undefined,
      cloudflareAccountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || undefined,
    };

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Parse request
    let body: {
      messages?: unknown[];
      model?: string;
      conversationId?: string;
      stream?: boolean;
    };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const { messages: rawMessages = [], model = "engagera-2.0", conversationId } = body;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    // Validate messages
    const incomingMessages = rawMessages.filter((m): m is IncomingMessage => {
      if (!m || typeof m !== "object") return false;
      const msg = m as Record<string, unknown>;
      return ["user", "assistant", "system"].includes(msg.role as string) &&
        (typeof msg.content === "string" || Array.isArray(msg.content));
    });

    if (incomingMessages.length === 0) {
      return json({ error: "No valid messages" }, 400);
    }

    // Auth
    const authResult = await resolveAuth(req, db, requestId);

    // Guest limit check
    if (authResult.type === "guest") {
      const { allowed, count } = await checkGuestLimit(db, authResult.guestSessionId);
      if (!allowed) {
        return json({
          error: "Guest message limit reached. Sign in for unlimited access.",
          guestMessageCount: count,
          guestMessageLimit: GUEST_LIMIT,
        }, 429);
      }
    }

    // Require at least some form of identity
    if (authResult.type === "none") {
      return json({ error: "Authentication required" }, 401);
    }

    // Build provider messages
    const lastUserMsg = incomingMessages.filter((m) => m.role === "user").at(-1);
    const userText = lastUserMsg ? getTextContent(lastUserMsg.content) : "";

    // Dev mode detection
    const isDevMode = model === "engagera-code" || model === "engagera-pro" ||
      (incomingMessages[0]?.role === "system" &&
        getTextContent(incomingMessages[0].content).toLowerCase().includes("dev"));

    const systemPrompt = buildSystemPrompt(isDevMode ? "dev" : "default");

    // Optional web search
    let searchContext = "";
    if (userText && needsWebSearch(userText)) {
      searchContext = await webSearch(userText, requestId);
    }

    // Build messages for provider
    const chatMessages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...(searchContext ? [{ role: "system" as const, content: `\n\nLive context from the web:\n${searchContext}` }] : []),
      ...toChat(incomingMessages.filter((m) => m.role !== "system")),
    ];

    const maxTokens = 2048;
    const result = await callWithFallback(chatMessages, keys, maxTokens, requestId);

    if (!result.ok) {
      log("error", "handler.all_providers_failed", { requestId, error: result.error });
      return json({ error: "AI service temporarily unavailable. Please try again." }, 503);
    }

    const latencyMs = Date.now() - startTime;
    log("info", "handler.success", {
      requestId, provider: result.provider, model: result.model,
      inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs,
    });

    // Persist conversation (non-fatal if fails)
    let convId = conversationId ?? null;
    if (authResult.type === "user" || authResult.type === "api_key") {
      const userId = authResult.type === "user" ? authResult.userId : authResult.userId;
      try {
        if (!convId) {
          const title = userText.slice(0, 60) || "New conversation";
          const { data: newConv } = await db.from("engagera_conversations").insert({
            user_id: userId, title, model,
          }).select("id").single();
          convId = newConv?.id ?? null;
        }
        if (convId) {
          await db.from("engagera_messages").insert([
            { conversation_id: convId, role: "user", content: userText, token_count: 0 },
            {
              conversation_id: convId, role: "assistant", content: result.content,
              token_count: result.outputTokens,
              metadata: searchContext ? { search: true } : null,
            },
          ]);
        }
      } catch (e) {
        log("warn", "handler.persist_failed", { requestId, error: String(e) });
      }

      // Usage record
      try {
        await db.from("engagera_usage_records").insert({
          user_id: userId, model: result.model ?? model,
          input_tokens: result.inputTokens, output_tokens: result.outputTokens,
          total_tokens: result.inputTokens + result.outputTokens,
        });
      } catch { /* non-fatal */ }
    }

    // Guest counter
    let newGuestCount: number | undefined;
    if (authResult.type === "guest") {
      newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);
    }

    return json({
      id: requestId,
      model: result.model ?? model,
      message: { role: "assistant", content: result.content },
      usage: {
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens: result.inputTokens + result.outputTokens,
      },
      conversationId: convId,
      ...(searchContext && { searchInfo: { query: userText } }),
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount,
        guestMessageLimit: GUEST_LIMIT,
      }),
    });
  } catch (err) {
    log("error", "handler.unhandled", { requestId, error: String(err) });
    return json({ error: "Internal server error" }, 500);
  }
});
