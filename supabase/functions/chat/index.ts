import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function v33
 *
 * Multi-provider AI routing with automatic fallback:
 *   1. Groq         — primary (fastest, 20K–6K TPM free tier)
 *   2. DeepSeek     — fallback #1 (OpenAI-compatible, generous limits)
 *   3. OpenRouter   — fallback #2 (free :free models, no credits needed)
 *   4. Gemini       — fallback #3 (Google, high rate limits, different API format)
 *
 * Web search  : DuckDuckGo HTML (free, no key) + Brave Search API (if key set)
 * Web crawl   : Jina AI Reader (free, no key) — converts any URL → clean text
 */

// ── Provider configurations ───────────────────────────────────────────────────
const GROQ_API_URL      = "https://api.groq.com/openai/v1/chat/completions";
const DEEPSEEK_API_URL  = "https://api.deepseek.com/v1/chat/completions";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_API_BASE   = "https://generativelanguage.googleapis.com/v1beta/models";

const GUEST_LIMIT     = 5;
const WINDOW_MS       = 24 * 60 * 60 * 1000;

// ── Provider + model lists (tried in order until one succeeds) ─────────────────
//   Each entry: { provider, model, apiUrlOrKey }
//   The callWithFallback() function fills in the actual key at runtime.

type Provider = "groq" | "deepseek" | "openrouter" | "gemini";

interface ProviderModel {
  provider: Provider;
  model: string;
}

const STANDARD_CHAIN: ProviderModel[] = [
  { provider: "groq",       model: "llama-3.1-8b-instant" },
  { provider: "deepseek",   model: "deepseek-chat" },
  { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct:free" },
  { provider: "gemini",     model: "gemini-1.5-flash-latest" },
];

const PREMIUM_CHAIN: ProviderModel[] = [
  { provider: "groq",       model: "llama-3.3-70b-versatile" },
  { provider: "deepseek",   model: "deepseek-chat" },
  { provider: "gemini",     model: "gemini-1.5-pro-latest" },
  { provider: "openrouter", model: "deepseek/deepseek-r1:free" },
  { provider: "groq",       model: "llama-3.1-8b-instant" },  // last resort
];

const CODE_CHAIN: ProviderModel[] = [
  { provider: "groq",       model: "llama-3.3-70b-versatile" },
  { provider: "deepseek",   model: "deepseek-chat" },
  { provider: "openrouter", model: "qwen/qwen-2.5-coder-32b-instruct:free" },
  { provider: "gemini",     model: "gemini-1.5-pro-latest" },
  { provider: "groq",       model: "llama-3.1-8b-instant" },
];

const IMAGE_CHAIN: ProviderModel[] = [
  { provider: "groq",     model: "llama-3.3-70b-versatile" },
  { provider: "deepseek", model: "deepseek-chat" },
  { provider: "gemini",   model: "gemini-1.5-pro-latest" },
];

// Map Engagera model ID → provider chain
const MODEL_CHAINS: Record<string, ProviderModel[]> = {
  "engagera-2.0":    STANDARD_CHAIN,
  "engagera-2.1":    STANDARD_CHAIN,
  "engagera-lite":   STANDARD_CHAIN,
  "engagera-pro":    PREMIUM_CHAIN,
  "engagera-reason": PREMIUM_CHAIN,
  "engagera-code":   CODE_CHAIN,
  "engagera-vision": STANDARD_CHAIN,
  "engagera-voice":  STANDARD_CHAIN,
  "engagera-image":  IMAGE_CHAIN,
};
const DEFAULT_CHAIN = STANDARD_CHAIN;

// ── Image-gen keyword / pattern lists ─────────────────────────────────────────
const IMAGE_GEN_KEYWORDS = [
  "generate image","generate a image","generate an image","generate picture",
  "generate a picture","generate photo","generate a photo","generate art",
  "generate artwork","generate illustration","generate an illustration",
  "generate logo","generate a logo","create image","create a image",
  "create an image","create picture","create a picture","create photo",
  "create a photo","create art","create artwork","create illustration",
  "create an illustration","create logo","create a logo","make image",
  "make a image","make an image","make picture","make a picture",
  "make me a picture","make photo","make a photo","make me a photo",
  "make art","make me art","make artwork","make illustration",
  "make an illustration","make logo","make a logo","make me an image",
  "make me a image","draw me","draw a","draw an","show me a picture",
  "show me an image","show me a photo","show me a drawing",
  "show me a painting","show me an illustration","show me a logo",
  "paint a","paint an","paint me","sketch a","sketch an","sketch me",
  "illustrate ","illustrate a","illustrate me","design a logo",
  "design an image","design a poster","design a banner","design a graphic",
  "design a thumbnail","design a wallpaper","render a","render an","render me",
  "picture of","image of","photo of","drawing of","painting of",
  "illustration of","portrait of","artwork of","sketch of",
  "a picture of","an image of","a photo of","a drawing of","a painting of",
  "a portrait of","can you draw","can you paint","can you sketch",
  "can you illustrate","can you create an image","can you make an image",
  "can you make a picture","can you generate an image",
  "can you generate a picture","could you draw","could you paint",
  "could you sketch","please draw","please paint","please create an image",
  "please generate","please illustrate","generate wallpaper",
  "create wallpaper","make wallpaper","generate poster","create poster",
  "make poster","generate banner","create banner","make banner",
  "generate thumbnail","create thumbnail",
];

const IMAGE_GEN_PATTERNS: RegExp[] = [
  /\b(image|picture|photo|drawing|painting|illustration|portrait|artwork|sketch|graphic|poster|wallpaper|banner|logo|thumbnail)\s+of\b/i,
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a|an|the|some|my)?\s*\w/i,
  /\b(generate|create|make|produce|design)\b.{0,40}\b(image|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|visual|graphic)\b/i,
  /\bshow\s+me\s+(a|an|the|some)\b.{0,30}\b(image|picture|photo|drawing|painting|illustration|portrait|logo)\b/i,
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render|create|generate|make|design)\b/i,
  /\b(i want|i need|i'd like|give me)\s+(a|an|the)\s+(image|picture|photo|drawing|illustration|painting|artwork|visual)\b/i,
];

// ── System prompts ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Engagera, an advanced AI assistant built by the AfuAI / Engagera team.

Identity:
- Built by the AfuAI / Engagera team. Never claim to be ChatGPT, Claude, Gemini, Llama, or any other AI.
- If asked who made you, say you were built by the AfuAI / Engagera team.
- If asked about your underlying model, say you are powered by advanced language models optimised for the Engagera platform.

Real-time capabilities — USE THESE PROACTIVELY:
- You have access to live web search results injected into your context when available.
- Use live data to answer questions about current news, prices, weather, sports, research, etc.
- After using search results, cite sources as [Title](URL).
- Always indicate when data is live: "As of [date from source]..."

General capabilities:
- Deep knowledge across science, technology, history, mathematics, coding, law, medicine, business, and art.
- Can analyse images, write and debug code in any language, generate SVG artwork.
- For ambiguous topics, rely on live search results when provided rather than potentially stale training data.

Style:
- Concise and genuinely helpful. Adapt tone to the user.
- Use markdown for code (always include language tag), lists, tables, and structured content.
- Mention sources when information comes from live search.`;

const IMAGE_SYSTEM_PROMPT = `You are an expert SVG illustrator. When the user asks you to draw, create, or generate an image, respond with ONLY a single SVG code block — no text before or after, no explanations, just the code block.

Rules:
- Use viewBox="0 0 400 400" width="400" height="400"
- Create vivid, colourful, detailed artwork with gradients, multiple shapes, and depth
- Use <defs> for linearGradient and radialGradient where it adds quality
- Add subtle shadows or glow effects with filters when fitting
- No <script> tags, no external resources, no text inside SVG unless it is part of the art
- Aim for 30-80 SVG elements so the image looks rich, not sparse

Respond EXACTLY in this format (nothing else):
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <!-- artwork here -->
</svg>
\`\`\``;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Logging ───────────────────────────────────────────────────────────────────
function log(level: "info"|"warn"|"error", event: string, data: Record<string,unknown>) {
  const entry = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

// ── Message types ─────────────────────────────────────────────────────────────
type ContentPart    = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type MessageContent = string | ContentPart[];
interface IncomingMessage { role: string; content: MessageContent; }

function isValidMessage(m: unknown): m is IncomingMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string,unknown>;
  if (!["user","assistant","system"].includes(msg.role as string)) return false;
  return typeof msg.content === "string" || Array.isArray(msg.content);
}

function getTextPreview(content: MessageContent): string {
  if (typeof content === "string") return content;
  const tp = content.find((p): p is { type:"text"; text:string } => p.type === "text");
  return tp?.text ?? "";
}

interface ChatMessage {
  role: string;
  content: string | MessageContent | null;
}

interface AIResult {
  ok: boolean;
  content: string;
  inputTokens: number;
  outputTokens: number;
  provider?: string;
  model?: string;
  errorDetail?: string;
}

// ── OpenAI-compatible provider call (Groq, DeepSeek, OpenRouter) ──────────────
async function callOpenAICompat(
  apiUrl: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
  providerName: string,
  extraHeaders?: Record<string,string>,
): Promise<AIResult> {
  const body = { model, messages, max_tokens: maxTokens };

  let res: Response | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 3000));
      log("warn", `${providerName}.retry`, { requestId, attempt });
    }
    try {
      res = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      log("warn", `${providerName}.network_error`, { requestId, attempt, error: String(err) });
      if (attempt === 1) return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
      continue;
    }
    if (res.ok || (res.status !== 429 && res.status !== 503)) break;
    log("warn", `${providerName}.rate_limited`, { requestId, status: res.status, attempt });
  }

  if (!res || !res.ok) {
    const errText = await res?.text().catch(() => "") ?? "";
    log("warn", `${providerName}.http_error`, { requestId, status: res?.status, error: errText.slice(0,200) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res?.status ?? "unknown"}: ${errText.slice(0,100)}` };
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };

  if (data.error) {
    log("warn", `${providerName}.api_error`, { requestId, error: data.error.message });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: data.error.message };
  }

  const content     = data.choices?.[0]?.message?.content ?? "";
  const inputTokens  = data.usage?.prompt_tokens ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  if (!content) {
    log("warn", `${providerName}.empty_response`, { requestId });
    return { ok: false, content: "", inputTokens, outputTokens, errorDetail: "empty response" };
  }

  log("info", `${providerName}.success`, { requestId, model, inputTokens, outputTokens, len: content.length });
  return { ok: true, content, inputTokens, outputTokens, provider: providerName, model };
}

// ── Google Gemini call (different API format) ─────────────────────────────────
async function callGemini(
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
): Promise<AIResult> {
  // Separate system message from conversation turns
  const systemMsg  = messages.find((m) => m.role === "system");
  const turnMsgs   = messages.filter((m) => m.role !== "system");

  // Convert to Gemini format: role "assistant" → "model"
  const contents = turnMsgs.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: typeof m.content === "string" ? m.content : getTextPreview(m.content as MessageContent) }],
  }));

  const geminiBody: Record<string,unknown> = {
    contents,
    generationConfig: { maxOutputTokens: maxTokens, temperature: 0.7 },
  };
  if (systemMsg) {
    geminiBody.system_instruction = {
      parts: [{ text: typeof systemMsg.content === "string" ? systemMsg.content : "" }],
    };
  }

  const url = `${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    });
  } catch (err) {
    log("warn", "gemini.network_error", { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("warn", "gemini.http_error", { requestId, status: res.status, error: errText.slice(0,200) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res.status}` };
  }

  const data = await res.json() as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    error?: { message?: string };
  };

  if (data.error) {
    log("warn", "gemini.api_error", { requestId, error: data.error.message });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: data.error.message };
  }

  const content      = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  const inputTokens  = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

  if (!content) {
    log("warn", "gemini.empty_response", { requestId, finishReason: data.candidates?.[0]?.finishReason });
    return { ok: false, content: "", inputTokens, outputTokens, errorDetail: "empty response" };
  }

  log("info", "gemini.success", { requestId, model, inputTokens, outputTokens, len: content.length });
  return { ok: true, content, inputTokens, outputTokens, provider: "gemini", model };
}

// ── Multi-provider fallback call ──────────────────────────────────────────────
interface ProviderKeys {
  groq?:       string;
  deepseek?:   string;
  openrouter?: string;
  gemini?:     string;
}

async function callWithFallback(
  chain: ProviderModel[],
  keys: ProviderKeys,
  messages: ChatMessage[],
  maxTokens: number,
  requestId: string,
): Promise<AIResult> {
  const errors: string[] = [];

  for (const { provider, model } of chain) {
    const key = keys[provider];
    if (!key) {
      log("info", "provider.no_key", { requestId, provider, model });
      continue;
    }

    let result: AIResult;

    if (provider === "groq") {
      result = await callOpenAICompat(GROQ_API_URL, key, model, messages, maxTokens, requestId, "groq");
    } else if (provider === "deepseek") {
      result = await callOpenAICompat(DEEPSEEK_API_URL, key, model, messages, maxTokens, requestId, "deepseek");
    } else if (provider === "openrouter") {
      result = await callOpenAICompat(OPENROUTER_API_URL, key, model, messages, maxTokens, requestId, "openrouter", {
        "HTTP-Referer": "https://engagera.afuchat.com",
        "X-Title": "Engagera",
      });
    } else if (provider === "gemini") {
      result = await callGemini(key, model, messages, maxTokens, requestId);
    } else {
      continue;
    }

    if (result.ok) {
      log("info", "fallback.success", { requestId, provider, model });
      return result;
    }

    errors.push(`${provider}/${model}: ${result.errorDetail ?? "failed"}`);
    log("warn", "fallback.next", { requestId, failed: `${provider}/${model}`, reason: result.errorDetail });
  }

  log("error", "fallback.all_failed", { requestId, errors });
  return {
    ok: false, content: "",
    inputTokens: 0, outputTokens: 0,
    errorDetail: errors.join(" | "),
  };
}

// ── Web search (DuckDuckGo free + optional Brave API) ─────────────────────────
async function webSearch(query: string, braveKey?: string): Promise<string> {
  if (braveKey) {
    try {
      const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=8`;
      const res = await fetch(url, {
        headers: {
          "Accept": "application/json",
          "Accept-Encoding": "gzip",
          "X-Subscription-Token": braveKey,
        },
      });
      if (res.ok) {
        const data = await res.json() as {
          web?: { results?: { title:string; url:string; description:string; age?:string }[] };
        };
        const results = data.web?.results ?? [];
        if (results.length > 0) {
          const lines = results.map((r, i) =>
            `${i+1}. **${r.title}**${r.age ? ` (${r.age})` : ""}\n   ${r.description}\n   URL: ${r.url}`
          );
          return `Search results for "${query}":\n\n${lines.join("\n\n")}`;
        }
      }
    } catch { /* fall through to DuckDuckGo */ }
  }

  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(ddgUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!res.ok) return `Search unavailable (HTTP ${res.status}). Try rephrasing.`;

    const html = await res.text();
    const results: { title:string; url:string; snippet:string }[] = [];

    const titleRe   = /<a[^>]+class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const titles:   { url:string; title:string }[] = [];
    const snippets: string[] = [];

    let m: RegExpExecArray | null;
    while ((m = titleRe.exec(html)) !== null && titles.length < 10) {
      let rawUrl = m[1];
      if (rawUrl.includes("uddg=")) {
        try { rawUrl = decodeURIComponent(rawUrl.split("uddg=")[1].split("&")[0]); } catch { /* ok */ }
      }
      const title = m[2].replace(/<[^>]*>/g, "").trim();
      if (title && rawUrl.startsWith("http")) titles.push({ url: rawUrl, title });
    }
    let s: RegExpExecArray | null;
    while ((s = snippetRe.exec(html)) !== null && snippets.length < 10) {
      snippets.push(s[1].replace(/<[^>]*>/g, "").trim());
    }
    for (let i = 0; i < Math.min(titles.length, snippets.length, 8); i++) {
      if (titles[i]?.title && snippets[i]) {
        results.push({ title: titles[i].title, url: titles[i].url, snippet: snippets[i] });
      }
    }

    if (results.length > 0) {
      const lines = results.map((r, i) =>
        `${i+1}. **${r.title}**\n   ${r.snippet}\n   URL: ${r.url}`
      );
      return `Search results for "${query}":\n\n${lines.join("\n\n")}`;
    }

    // Last resort: DuckDuckGo Instant Answer API
    const iaRes = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`,
      { headers: { "Accept": "application/json" } },
    );
    if (iaRes.ok) {
      const ia = await iaRes.json() as {
        AbstractText?: string; AbstractURL?: string;
        RelatedTopics?: { Text?:string; FirstURL?:string }[];
      };
      const parts: string[] = [];
      if (ia.AbstractText) parts.push(`${ia.AbstractText}\nSource: ${ia.AbstractURL ?? ""}`);
      (ia.RelatedTopics ?? []).slice(0, 5).forEach((t) => {
        if (t.Text) parts.push(`• ${t.Text}${t.FirstURL ? `  URL: ${t.FirstURL}` : ""}`);
      });
      if (parts.length > 0) return `Results for "${query}":\n\n${parts.join("\n\n")}`;
    }

    return `No results found for "${query}". Try a different query.`;
  } catch (err) {
    return `Search failed: ${String(err)}`;
  }
}

// ── Webpage fetcher via Jina AI Reader (free, no key) ─────────────────────────
async function fetchWebpage(url: string): Promise<string> {
  try {
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      return "Invalid URL — must start with http:// or https://";
    }
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: {
        "Accept": "text/plain",
        "X-Return-Format": "markdown",
        "X-Timeout": "15",
      },
    });
    if (!res.ok) return `Could not fetch "${url}" (HTTP ${res.status}).`;
    const text = await res.text();
    return text.length > 6000 ? text.slice(0, 6000) + "\n\n[Content truncated]" : text;
  } catch (err) {
    return `Failed to fetch page: ${String(err)}`;
  }
}

// ── Real-time query detection ─────────────────────────────────────────────────
const REALTIME_PATTERNS = [
  /\b(today|tonight|right now|at the moment|as of now|currently|live|real.?time)\b/i,
  /\b(latest|current|recent|new|breaking|just|fresh|up.?to.?date)\b.{0,30}\b(news|price|score|result|update|data|info|report)\b/i,
  /\b(price|cost|rate|value|stock|crypto|bitcoin|btc|eth|ethereum|forex|currency)\b/i,
  /\b(weather|forecast|temperature|rain|snow|wind|humidity)\b/i,
  /\b(score|result|standing|fixture|match|game|tournament|league|championship)\b.{0,20}\b(today|live|now|tonight|yesterday)\b/i,
  /\b(trending|viral|popular|top)\b.{0,20}\b(now|today|this week|right now)\b/i,
  /\b(who won|who is winning|what happened|what.?s happening|what.?s the)\b/i,
  /\bhow much (is|does|do|are|cost)\b/i,
  /\b(search|look up|find|check|google)\b.{0,20}\b(web|internet|online|current|latest)\b/i,
  /\b(2024|2025|2026)\b.{0,30}\b(news|update|result|report|data)\b/i,
];

function needsWebSearch(messages: ChatMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return null;
  const text = typeof last.content === "string" ? last.content : "";
  if (!text) return null;
  for (const re of REALTIME_PATTERNS) {
    if (re.test(text)) return text;
  }
  return null;
}

function buildSearchQuery(userText: string): string {
  return userText
    .replace(/please|could you|can you|would you|kindly|i want to know|tell me|find me/gi, "")
    .replace(/\s+/g, " ").trim()
    .slice(0, 150);
}

// ── Agentic chat: pre-search then multi-provider call ────────────────────────
async function agenticChat(
  keys: ProviderKeys,
  chain: ProviderModel[],
  messages: ChatMessage[],
  requestId: string,
  braveKey?: string,
): Promise<{ reply:string; inputTokens:number; outputTokens:number; provider?:string; providerModel?:string }> {
  const convo: ChatMessage[] = [...messages];

  // Step 1 — Check whether the query needs fresh web data
  const userText = needsWebSearch(messages);

  if (userText) {
    const query = buildSearchQuery(userText);
    log("info", "pre_search.start", { requestId, query });
    const searchResult = await webSearch(query, braveKey);
    log("info", "pre_search.done", { requestId, resultLen: searchResult.length });

    const trimmed = searchResult.slice(0, 2500);
    const sysIdx  = convo.findIndex((m) => m.role === "system");
    const contextBlock = `\n\n---\n🌐 **Live web search results** (retrieved just now):\n\n${trimmed}\n---\n\nUse the above results to answer. Cite sources as [Title](URL). Indicate when data is live: "As of [date from source]..."`;

    if (sysIdx >= 0 && typeof convo[sysIdx].content === "string") {
      convo[sysIdx] = { ...convo[sysIdx], content: (convo[sysIdx].content as string) + contextBlock };
    } else {
      convo.unshift({ role: "system", content: contextBlock });
    }

    // Use the standard (faster, higher-TPM) chain when search is involved
    const fastChain = STANDARD_CHAIN;
    const result = await callWithFallback(fastChain, keys, convo, 4096, requestId);
    if (result.ok) {
      return { reply: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens, provider: result.provider, providerModel: result.model };
    }
  } else {
    // No search needed — use the model's own chain
    const result = await callWithFallback(chain, keys, convo, 4096, requestId);
    if (result.ok) {
      return { reply: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens, provider: result.provider, providerModel: result.model };
    }
  }

  return {
    reply: "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
    inputTokens: 0, outputTokens: 0,
  };
}

// ── Image helpers ─────────────────────────────────────────────────────────────
function isImageGenRequest(messages: IncomingMessage[]): boolean {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return false;
  const text = getTextPreview(lastUser.content).toLowerCase();
  if (IMAGE_GEN_KEYWORDS.some((k) => text.includes(k))) return true;
  if (IMAGE_GEN_PATTERNS.some((p) => p.test(text))) return true;
  return false;
}

function extractImagePrompt(messages: IncomingMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "a beautiful scene";
  const STRIPS = [
    /generate (an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) of /i,
    /create (an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) (of |showing |depicting )?/i,
    /make (me )?(an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) (of |showing |depicting )?/i,
    /draw (me )?(an? )?/i, /illustrate (an? )?/i, /paint (an? )?/i, /sketch (an? )?/i,
    /render (an? )?(image|visual|picture) of /i,
    /show me (an? )?(image|picture|photo|illustration) of /i,
    /design (an? )?(logo|visual|image) (for |of |showing )?/i,
    /can you (draw|paint|sketch|illustrate|render|create|generate|make|design) (me )?(an? )?/i,
    /could you (draw|paint|sketch|illustrate|render|create|generate|make|design) (me )?(an? )?/i,
    /please (draw|paint|sketch|illustrate|create|generate|make|design) (me )?(an? )?/i,
    /i (want|need|'d like) (an? )?(image|picture|photo|drawing|illustration|painting|artwork|visual) of /i,
    /give me (an? )?(image|picture|photo|drawing|illustration|painting|artwork|visual) of /i,
    /(a |an )?(picture|image|photo|drawing|painting|illustration|portrait|artwork|sketch) of /i,
  ];
  let prompt = getTextPreview(lastUser.content).trim();
  for (const re of STRIPS) prompt = prompt.replace(re, "").trim();
  return prompt || getTextPreview(lastUser.content).trim() || "a beautiful scene";
}

async function persistLog(
  db: ReturnType<typeof createClient>,
  logEntry: Record<string,unknown>,
  startTime: number,
): Promise<void> {
  logEntry.latency_ms   = Date.now() - startTime;
  logEntry.total_tokens = (logEntry.input_tokens as number ?? 0) + (logEntry.output_tokens as number ?? 0);
  try { await db.from("engagera_request_logs").insert(logEntry); } catch { /* fire-and-forget */ }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  const requestId = `eng_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
  const startTime = Date.now();

  const logEntry: Record<string,unknown> = {
    request_id: requestId, model: "engagera-2.0", path: "chat",
    success: false, error_code: null, latency_ms: 0,
    input_tokens: 0, output_tokens: 0, total_tokens: 0,
  };

  try {
    const supabaseUrl  = Deno.env.get("SUPABASE_URL");
    const serviceKey   = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Provider keys — all optional except at least one must be present
    const keys: ProviderKeys = {
      groq:       Deno.env.get("GROQ_API_KEY")       || undefined,
      deepseek:   Deno.env.get("DEEPSEEK_API_KEY")   || undefined,
      openrouter: Deno.env.get("OPENROUTER_API_KEY") || undefined,
      gemini:     Deno.env.get("GEMINI_API_KEY")      || undefined,
    };
    const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");

    if (!supabaseUrl) return json({ error: "SUPABASE_URL not configured" }, 500);
    if (!serviceKey)  return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);

    const hasAnyKey = Object.values(keys).some(Boolean);
    if (!hasAnyKey)  return json({ error: "No AI provider keys configured" }, 500);

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: Record<string,unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { messages, model = "engagera-2.0", conversationId, contextHint } = body as {
      messages: unknown[];
      model?: string;
      conversationId?: number;
      contextHint?: string;
    };

    logEntry.model = model;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }
    const validMessages = messages.filter(isValidMessage);
    if (validMessages.length === 0) return json({ error: "No valid messages" }, 400);

    // ── Auth ──────────────────────────────────────────────────────────────────
    let userId: string | undefined;
    let guestSessionId: string | undefined;

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token   = authHeader.slice(7);
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      if (token && token !== anonKey) {
        const { data, error: authErr } = await db.auth.getUser(token);
        userId = data.user?.id;
        if (authErr) log("warn", "auth.jwt_error", { requestId, error: authErr.message });
      }
    }

    if (!userId) {
      guestSessionId = req.headers.get("x-guest-session-id") ?? undefined;
      if (!guestSessionId) return json({ error: "Authentication or guest session required" }, 401);

      const now = new Date();
      const { data: session, error: sessionError } = await db
        .from("engagera_guest_sessions")
        .select("message_count, window_start")
        .eq("session_id", guestSessionId)
        .maybeSingle();

      if (sessionError) {
        log("error", "guest.session_lookup_failed", { requestId, error: JSON.stringify(sessionError) });
        return json({ error: "Session lookup failed" }, 500);
      }

      if (!session) {
        const { error: insertError } = await db.from("engagera_guest_sessions").insert({
          session_id: guestSessionId, message_count: 0,
          window_start: now.toISOString(), last_seen_at: now.toISOString(),
        });
        if (insertError) {
          log("error", "guest.session_create_failed", { requestId, error: JSON.stringify(insertError) });
          return json({ error: "Session create failed" }, 500);
        }
      } else {
        const windowAge = now.getTime() - new Date(session.window_start).getTime();
        if (windowAge >= WINDOW_MS) {
          await db.from("engagera_guest_sessions").update({
            message_count: 0, window_start: now.toISOString(), last_seen_at: now.toISOString(),
          }).eq("session_id", guestSessionId);
        } else if (session.message_count >= GUEST_LIMIT) {
          const resetAt = new Date(new Date(session.window_start).getTime() + WINDOW_MS);
          return json({
            error: "Daily message limit reached. Sign up for unlimited access.",
            windowResetAt: resetAt.toISOString(),
            guestMessageCount: session.message_count,
            guestMessageLimit: GUEST_LIMIT,
          }, 429);
        }
      }
    }

    logEntry.user_id          = userId ?? null;
    logEntry.guest_session_id = guestSessionId ?? null;

    // ── Route: image gen vs agentic chat ──────────────────────────────────────
    const isImageModel     = model === "engagera-image";
    const is21ImageRequest = (model === "engagera-2.1" || model === "engagera-2.0") && isImageGenRequest(validMessages);
    const generateImage    = isImageModel || is21ImageRequest;
    logEntry.path          = generateImage ? "image_gen" : "chat";

    const lastUserMsg   = [...validMessages].reverse().find((m) => m.role === "user");
    const promptPreview = (lastUserMsg ? getTextPreview(lastUserMsg.content) : "").slice(0, 120);
    logEntry.prompt_preview = promptPreview;

    const chain = MODEL_CHAINS[model] ?? DEFAULT_CHAIN;

    log("info", "request.start", {
      requestId, model, path: logEntry.path,
      authed: !!userId, messageCount: validMessages.length,
      providers: chain.map((c) => c.provider).filter((v, i, a) => a.indexOf(v) === i),
    });

    let reply = "", inputTokens = 0, outputTokens = 0, totalTokens = 0;

    if (generateImage) {
      const imagePrompt = extractImagePrompt(validMessages);
      const svgMsgs: ChatMessage[] = [
        { role: "system", content: IMAGE_SYSTEM_PROMPT },
        { role: "user",   content: imagePrompt },
      ];
      const result = await callWithFallback(IMAGE_CHAIN, keys, svgMsgs, 4096, requestId);
      if (result.ok && (result.content.includes("```svg") || result.content.includes("<svg"))) {
        reply = result.content;
        inputTokens = result.inputTokens; outputTokens = result.outputTokens;
        totalTokens = inputTokens + outputTokens;
      } else {
        reply = "I wasn't able to generate that image right now. Please try again.";
        logEntry.error_code = `image_gen_failed: ${result.errorDetail ?? "no svg block"}`;
      }
    } else {
      const systemContent = contextHint
        ? `${SYSTEM_PROMPT}\n\n[User context] ${contextHint}`
        : SYSTEM_PROMPT;

      const chatMsgs: ChatMessage[] = [
        { role: "system", content: systemContent },
        ...validMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role:    m.role,
            content: typeof m.content === "string" ? m.content : getTextPreview(m.content),
          })),
      ];

      const chatResult = await agenticChat(keys, chain, chatMsgs, requestId, braveKey);
      reply        = chatResult.reply;
      inputTokens  = chatResult.inputTokens;
      outputTokens = chatResult.outputTokens;
      totalTokens  = inputTokens + outputTokens;

      log("info", "chat.complete", {
        requestId, replyLen: reply.length,
        inputTokens, outputTokens,
        provider: chatResult.provider,
        providerModel: chatResult.providerModel,
      });
    }

    logEntry.input_tokens  = inputTokens;
    logEntry.output_tokens = outputTokens;
    logEntry.total_tokens  = totalTokens;

    // ── Persist conversation ──────────────────────────────────────────────────
    let convId: number | undefined = conversationId;
    try {
      if (!convId) {
        const insert: Record<string,unknown> = {
          title: promptPreview.slice(0, 60) || "New conversation", model,
        };
        if (userId) insert.user_id = userId;
        else insert.guest_session_id = guestSessionId;
        const { data, error: convErr } = await db.from("engagera_conversations")
          .insert(insert).select("id").single();
        if (convErr) log("warn", "conv.insert_failed", { requestId, error: JSON.stringify(convErr) });
        convId = data?.id;
      } else {
        await db.from("engagera_conversations")
          .update({ updated_at: new Date().toISOString(), model }).eq("id", convId);
      }
      if (convId) {
        const msgSaves: Promise<unknown>[] = [
          db.from("engagera_messages").insert({
            conversation_id: convId, role: "assistant", content: reply, token_count: totalTokens,
          }),
          db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
        ];
        if (lastUserMsg) {
          const userText = typeof lastUserMsg.content === "string"
            ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
          msgSaves.push(db.from("engagera_messages").insert({
            conversation_id: convId, role: "user", content: userText, token_count: 0,
          }));
        }
        await Promise.allSettled(msgSaves);
      }
    } catch (err) {
      log("warn", "conv.persist_failed", { requestId, error: String(err) });
    }

    // ── Usage record ──────────────────────────────────────────────────────────
    if (userId) {
      try {
        await db.from("engagera_usage_records").insert({
          user_id: userId, model,
          input_tokens: inputTokens, output_tokens: outputTokens, total_tokens: totalTokens,
        });
      } catch { /* non-fatal */ }
    }

    // ── Guest counter ─────────────────────────────────────────────────────────
    let newGuestCount: number | undefined;
    if (guestSessionId) {
      try {
        const { data } = await db.rpc("engagera_increment_guest_count", { p_session_id: guestSessionId });
        newGuestCount = typeof data === "number" ? data : undefined;
      } catch { /* non-fatal */ }
    }

    logEntry.success = true;
    await persistLog(db, logEntry, startTime);

    return json({
      id: requestId, model,
      message: { role: "assistant", content: reply },
      usage: { inputTokens, outputTokens, totalTokens },
      conversationId: convId,
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT,
      }),
    });

  } catch (err) {
    log("error", "handler.unhandled", { requestId, error: String(err) });
    return json({ error: "Internal server error" }, 500);
  }
});
