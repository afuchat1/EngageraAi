import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function — v11 (2026-07-17)
 *
 * Improvements over v10:
 *  - SSE streaming: emits searchStatus → meta (sources) → token → done
 *  - Real web search: extracts actual URLs, titles, snippets from DuckDuckGo
 *  - Parallel OG-image enrichment runs alongside the AI call (no added latency)
 *  - Broader search triggers
 *  - System prompt forbids raw URLs in responses
 */

// ── Provider URLs ─────────────────────────────────────────────────────────────
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CF_BASE      = "https://api.cloudflare.com/client/v4/accounts";

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

function log(
  level: "info" | "warn" | "error",
  event: string,
  data: Record<string, unknown>,
) {
  const entry = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

// ── Types ─────────────────────────────────────────────────────────────────────
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
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
interface SearchSource {
  title: string;
  url: string;
  snippet: string;
  image?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTextContent(content: MessageContent): string {
  if (typeof content === "string") return content;
  return (
    content.find((p): p is { type: "text"; text: string } => p.type === "text")?.text ?? ""
  );
}

function toChat(msgs: IncomingMessage[]): ChatMessage[] {
  return msgs
    .filter((m) => ["user", "assistant", "system"].includes(m.role))
    .map((m) => ({ role: m.role, content: getTextContent(m.content) }));
}

function sseFrame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
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
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(extraHeaders ?? {}),
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("warn", `${providerName}.http_error`, {
        requestId,
        status: res.status,
        err: err.slice(0, 200),
      });
      return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
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

// ── Cloudflare Workers AI ─────────────────────────────────────────────────────
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
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("warn", "cloudflare.http_error", { requestId, status: res.status, err: err.slice(0, 200) });
      return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      success?: boolean;
      result?: { response?: string };
      errors?: { message?: string }[];
    };
    if (!data.success) {
      const err = data.errors?.map((e) => e.message).join("; ") ?? "unknown";
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
  keys: {
    groq?: string;
    cerebras?: string;
    cloudflare?: string;
    cloudflareAccountId?: string;
  },
  maxTokens: number,
  requestId: string,
): Promise<AIResult> {
  if (keys.groq) {
    const r = await callOAI(
      GROQ_URL, keys.groq, "llama-3.3-70b-versatile",
      messages, maxTokens, requestId, "groq",
    );
    if (r.ok) return r;
  }
  if (keys.groq) {
    const r = await callOAI(
      GROQ_URL, keys.groq, "llama-3.1-8b-instant",
      messages, maxTokens, requestId, "groq-lite",
    );
    if (r.ok) return r;
  }
  if (keys.cerebras) {
    const r = await callOAI(
      CEREBRAS_URL, keys.cerebras, "gpt-oss-120b",
      messages, maxTokens, requestId, "cerebras",
    );
    if (r.ok) return r;
  }
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

// ── Web search — real URLs + titles + snippets ────────────────────────────────
async function webSearch(query: string, requestId: string): Promise<SearchSource[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const html = await res.text();

    // Extract title + redirect-URL pairs (.result__a)
    const linkRe = /<a\s[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    // Extract snippets (.result__snippet)
    const snippetRe = /<a\s[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: { url: string; title: string }[] = [];
    const snippets: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(html)) !== null && links.length < 10) {
      let url = m[1];
      // DuckDuckGo wraps destinations in /l/?uddg=ENCODED_URL&rut=...
      const uddg = url.match(/[?&]uddg=([^&]+)/);
      if (uddg) {
        try { url = decodeURIComponent(uddg[1]); } catch { continue; }
      }
      if (!url.startsWith("http")) continue;
      const title = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (title) links.push({ url, title });
    }

    while ((m = snippetRe.exec(html)) !== null && snippets.length < 10) {
      const text = m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
      if (text.length > 10) snippets.push(text);
    }

    const results: SearchSource[] = [];
    for (let i = 0; i < Math.min(links.length, snippets.length, 6); i++) {
      results.push({ url: links[i].url, title: links[i].title, snippet: snippets[i] });
    }

    log("info", "search.done", { requestId, results: results.length, query: query.slice(0, 60) });
    return results;
  } catch (err) {
    log("warn", "search.error", { requestId, error: String(err) });
    return [];
  }
}

// ── OG image fetch for a single URL (best-effort, short timeout) ──────────────
async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Engagera/1.0; +https://engagera.ai)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return undefined;
    // Read only the first 8 KB — the OG tag is always in <head>
    const reader = res.body?.getReader();
    if (!reader) return undefined;
    let chunk = "";
    for (let i = 0; i < 6; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      chunk += new TextDecoder().decode(value);
      if (chunk.includes("</head>") || chunk.includes("<body")) break;
    }
    reader.cancel().catch(() => {});
    const imgMatch =
      chunk.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      chunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      chunk.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
    const img = imgMatch?.[1]?.trim();
    return img?.startsWith("http") ? img : undefined;
  } catch {
    return undefined;
  }
}

// ── Enrich top sources with OG images (parallel, non-blocking) ───────────────
async function enrichWithImages(
  sources: SearchSource[],
  maxEnrich = 4,
): Promise<SearchSource[]> {
  if (sources.length === 0) return sources;
  const toEnrich = sources.slice(0, maxEnrich);
  const rest = sources.slice(maxEnrich);
  const images = await Promise.all(toEnrich.map((s) => fetchOgImage(s.url)));
  const enriched = toEnrich.map((s, i) => (images[i] ? { ...s, image: images[i] } : s));
  return [...enriched, ...rest];
}

// ── Search trigger detection ──────────────────────────────────────────────────
function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase().trim();

  // Skip purely creative writing requests
  if (/^(write (me |a |an |the )?|compose |draft |create a (story|poem|essay|letter|email))/i.test(text.trim())) {
    return false;
  }
  // Skip pure math
  if (/^(calculate|compute|solve for|what is \d[\d\s+\-*/^()]*[=?]|simplify|integrate|differentiate)/i.test(text.trim())) {
    return false;
  }

  const triggers = [
    // Time-sensitive
    "latest", "recent", "today", "tonight", "yesterday", "this week", "this year",
    "news", "current", "now", "live", "update", "breaking",
    "2023", "2024", "2025", "2026", "2027",
    // Prices / markets
    "price", "cost", "how much", "worth", "value", "rate", "fee",
    "stock", "crypto", "bitcoin", "ethereum",
    // Sports / events
    "score", "result", "standings", "winner", "who won", "match", "game",
    "tournament", "championship", "election",
    // Weather / location
    "weather", "temperature", "forecast", "humidity",
    "where is", "where are", "location of",
    // People / companies
    "who is", "who are", "ceo of", "founder of", "owner of",
    "what company", "which company",
    // Products / releases
    "release", "launch", "announce", "new model", "new version", "update",
    "specs", "review", "vs ", " vs", "versus", "compare", "comparison",
    "best ", "top ", "ranking", "trending", "popular",
    "buy", "purchase", "available", "in stock",
    // Research / facts
    "what is the ", "what are the ", "how many ", "how does ",
    "statistics", "data on", "report", "study", "research",
    "definition", "meaning of", "explain the",
    // How-to
    "how to ", "steps to ", "tutorial", "guide",
  ];

  return triggers.some((t) => lower.includes(t));
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(mode: "dev" | "default", searchContext: string): string {
  const dateStr = new Date().toISOString().slice(0, 10);

  const sharedRules = `
Important rules:
- Today's date is ${dateStr}. You have real-time web access — NEVER say you cannot check current events or recent information.
- Write clean, well-formatted responses using markdown: headers, bold, bullet lists, numbered lists, code blocks where appropriate.
- NEVER include raw URLs (https://...) anywhere in your response text. Refer to sources by name only (e.g. "According to Reuters", "Microsoft's official page states...", "GitHub shows...").
- NEVER show internal markers such as [source], [1], [SEARCH], {{citation}}, or any implementation detail.
- Format all code with proper fenced code blocks and the correct language label.
- Be direct, accurate, and helpful. Avoid unnecessary padding or filler phrases.
`.trim();

  if (mode === "dev") {
    return `You are Engagera Dev — an expert software engineering assistant built by AfuAI, the AI division of AfuChat Technologies Limited. You help developers build production-quality software.\n${sharedRules}${searchContext ? `\n\nLive web search results (use these to inform your answer):\n${searchContext}` : ""}`;
  }

  return `You are Engagera — an advanced AI assistant built by AfuAI (AfuChat Technologies Limited). You are knowledgeable, fluent, and capable across all subjects.\n${sharedRules}${searchContext ? `\n\nLive web search results (use these to inform your answer):\n${searchContext}` : ""}`;
}

// ── Format search context for the system prompt ───────────────────────────────
function formatSearchContext(sources: SearchSource[]): string {
  return sources
    .slice(0, 5)
    .map((s, i) => `[${i + 1}] ${s.title}\n    Source: ${new URL(s.url).hostname.replace(/^www\./, "")}\n    ${s.snippet}`)
    .join("\n\n");
}

// ── Auth ──────────────────────────────────────────────────────────────────────
type AuthResult =
  | { type: "api_key"; userId?: string; apiKeyId: number }
  | { type: "user"; userId: string }
  | { type: "guest"; guestSessionId: string }
  | { type: "none" };

async function resolveAuth(
  req: Request,
  db: ReturnType<typeof createClient>,
  requestId: string,
): Promise<AuthResult> {
  const apiKeyHeader = req.headers.get("x-engagera-api-key");
  if (apiKeyHeader?.startsWith("eng_")) {
    const keyHash = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKeyHeader)),
      ),
    ).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: keyRow, error: keyErr } = await db
      .from("engagera_api_keys")
      .select("id, user_id, is_active")
      .eq("key_hash", keyHash)
      .single();
    if (keyErr) log("warn", "auth.api_key_lookup_error", { requestId, err: keyErr.message });
    if (keyRow?.is_active) {
      log("info", "auth.api_key", { requestId, keyId: keyRow.id });
      return { type: "api_key", userId: keyRow.user_id, apiKeyId: keyRow.id };
    }
    return { type: "none" };
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const { data } = await db.auth.getUser(token);
    if (data.user) {
      log("info", "auth.jwt", { requestId, userId: data.user.id });
      return { type: "user", userId: data.user.id };
    }
  }

  const guestId = req.headers.get("x-guest-session-id")?.trim();
  if (guestId) return { type: "guest", guestSessionId: guestId };

  return { type: "none" };
}

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
  if (error || !data) return { allowed: true, count: 0 };
  if (data.window_start < windowStart) return { allowed: true, count: 0 };
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

// ── Persist conversation + usage (non-fatal) ──────────────────────────────────
async function persistConversation(
  db: ReturnType<typeof createClient>,
  authResult: AuthResult,
  userText: string,
  aiResult: AIResult,
  model: string,
  conversationId: string | undefined,
  hadSearch: boolean,
  requestId: string,
): Promise<number | null> {
  let convId: number | null = conversationId ? Number(conversationId) : null;

  if (authResult.type !== "user" && authResult.type !== "api_key") return convId;
  const userId = authResult.userId;

  try {
    if (!convId) {
      const title = userText.slice(0, 60) || "New conversation";
      const { data: newConv } = await db
        .from("engagera_conversations")
        .insert({ user_id: userId, title, model })
        .select("id")
        .single();
      convId = newConv?.id ?? null;
    }
    if (convId) {
      await db.from("engagera_messages").insert([
        { conversation_id: convId, role: "user", content: userText, token_count: 0 },
        {
          conversation_id: convId,
          role: "assistant",
          content: aiResult.content,
          token_count: aiResult.outputTokens,
          metadata: hadSearch ? { search: true } : null,
        },
      ]);
    }
  } catch (e) {
    log("warn", "handler.persist_failed", { requestId, error: String(e) });
  }

  try {
    await db.from("engagera_usage_records").insert({
      user_id: userId,
      model: aiResult.model ?? model,
      input_tokens: aiResult.inputTokens,
      output_tokens: aiResult.outputTokens,
      total_tokens: aiResult.inputTokens + aiResult.outputTokens,
    });
  } catch { /* non-fatal */ }

  return convId;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const requestId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
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

    const {
      messages: rawMessages = [],
      model = "engagera-2.0",
      conversationId,
      stream: wantsStream = true,
    } = body;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const incomingMessages = rawMessages.filter((m): m is IncomingMessage => {
      if (!m || typeof m !== "object") return false;
      const msg = m as Record<string, unknown>;
      return (
        ["user", "assistant", "system"].includes(msg.role as string) &&
        (typeof msg.content === "string" || Array.isArray(msg.content))
      );
    });

    if (incomingMessages.length === 0) {
      return json({ error: "No valid messages" }, 400);
    }

    const authResult = await resolveAuth(req, db, requestId);

    if (authResult.type === "guest") {
      const { allowed, count } = await checkGuestLimit(db, authResult.guestSessionId);
      if (!allowed) {
        return json(
          {
            error: "Guest message limit reached. Sign in for unlimited access.",
            guestMessageCount: count,
            guestMessageLimit: GUEST_LIMIT,
          },
          429,
        );
      }
    }

    if (authResult.type === "none") {
      return json({ error: "Authentication required" }, 401);
    }

    const lastUserMsg = incomingMessages.filter((m) => m.role === "user").at(-1);
    const userText    = lastUserMsg ? getTextContent(lastUserMsg.content) : "";

    const isDevMode =
      model === "engagera-code" ||
      (incomingMessages[0]?.role === "system" &&
        getTextContent(incomingMessages[0].content).toLowerCase().includes("dev"));

    const shouldSearch = userText.length > 3 && needsWebSearch(userText);

    // ── Shared builder ────────────────────────────────────────────────────────
    function buildMessages(searchContext: string): ChatMessage[] {
      return [
        { role: "system", content: buildSystemPrompt(isDevMode ? "dev" : "default", searchContext) },
        ...toChat(incomingMessages.filter((m) => m.role !== "system")),
      ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SSE streaming path
    // ═══════════════════════════════════════════════════════════════════════
    if (wantsStream) {
      const enc = new TextEncoder();

      const sseStream = new ReadableStream({
        async start(ctrl) {
          const enq = (frame: string) => ctrl.enqueue(enc.encode(frame));

          try {
            let searchSources: SearchSource[] = [];
            let aiResult: AIResult;

            if (shouldSearch) {
              // ── Phase 1: search ──────────────────────────────────────────
              enq(sseFrame({ type: "searchStatus", message: "Searching the web…" }));

              const rawSources = await webSearch(userText, requestId);

              if (rawSources.length > 0) {
                enq(sseFrame({ type: "searchStatus", message: "Reading sources…" }));

                // ── Phase 2: OG images + AI call in parallel ─────────────
                const searchCtx = formatSearchContext(rawSources);
                const [enriched, result] = await Promise.all([
                  enrichWithImages(rawSources, 4),
                  callWithFallback(buildMessages(searchCtx), keys, 2048, requestId),
                ]);
                searchSources = enriched;
                aiResult = result;

                // Emit sources so the UI can show source cards
                enq(sseFrame({
                  type: "meta",
                  searchInfo: { query: userText, sources: searchSources },
                }));
              } else {
                // Search returned nothing — fall through to direct AI
                aiResult = await callWithFallback(buildMessages(""), keys, 2048, requestId);
              }
            } else {
              // ── No search — direct AI ────────────────────────────────────
              aiResult = await callWithFallback(buildMessages(""), keys, 2048, requestId);
            }

            if (!aiResult!.ok) {
              enq(sseFrame({ type: "error", error: "AI service temporarily unavailable. Please try again." }));
              enq("data: [DONE]\n\n");
              ctrl.close();
              return;
            }

            // ── Emit the full AI response as a single token event ─────────
            enq(sseFrame({ type: "token", content: aiResult!.content }));

            // ── Persist + guest counter ───────────────────────────────────
            const convId = await persistConversation(
              db, authResult, userText, aiResult!, model,
              conversationId, searchSources.length > 0, requestId,
            );
            let newGuestCount: number | undefined;
            if (authResult.type === "guest") {
              newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);
            }

            // ── Done event ───────────────────────────────────────────────
            const latencyMs = Date.now() - startTime;
            log("info", "handler.success", {
              requestId,
              provider: aiResult!.provider,
              model: aiResult!.model,
              latencyMs,
            });

            enq(sseFrame({
              type: "done",
              model: aiResult!.model ?? model,
              conversationId: convId,
              ...(searchSources.length > 0 && { crawledSources: searchSources }),
              ...(newGuestCount !== undefined && {
                guestMessageCount: newGuestCount,
                guestMessageLimit: GUEST_LIMIT,
              }),
            }));

            enq("data: [DONE]\n\n");
            ctrl.close();
          } catch (err) {
            log("error", "stream.error", { requestId, error: String(err) });
            try {
              enq(sseFrame({ type: "error", error: "Internal server error" }));
              enq("data: [DONE]\n\n");
              ctrl.close();
            } catch { /* already closed */ }
          }
        },
      });

      return new Response(sseStream, {
        status: 200,
        headers: {
          ...CORS,
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "X-Accel-Buffering": "no",
        },
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // JSON fallback path (stream: false)
    // ═══════════════════════════════════════════════════════════════════════
    let searchSources: SearchSource[] = [];
    let searchContext = "";

    if (shouldSearch) {
      const rawSources = await webSearch(userText, requestId);
      if (rawSources.length > 0) {
        searchContext = formatSearchContext(rawSources);
        const [enriched, result] = await Promise.all([
          enrichWithImages(rawSources, 3),
          callWithFallback(buildMessages(searchContext), keys, 2048, requestId),
        ]);
        searchSources = enriched;
        if (!result.ok) return json({ error: "AI service temporarily unavailable." }, 503);

        const convId = await persistConversation(
          db, authResult, userText, result, model, conversationId, true, requestId,
        );
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
          crawledSources: searchSources,
          ...(newGuestCount !== undefined && {
            guestMessageCount: newGuestCount,
            guestMessageLimit: GUEST_LIMIT,
          }),
        });
      }
    }

    // No search or search returned nothing
    const result = await callWithFallback(buildMessages(""), keys, 2048, requestId);
    if (!result.ok) return json({ error: "AI service temporarily unavailable. Please try again." }, 503);

    const convId = await persistConversation(
      db, authResult, userText, result, model, conversationId, false, requestId,
    );
    let newGuestCount: number | undefined;
    if (authResult.type === "guest") {
      newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);
    }

    const latencyMs = Date.now() - startTime;
    log("info", "handler.success", { requestId, provider: result.provider, model: result.model, latencyMs });

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
