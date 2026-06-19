import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function v40
 *
 * Multi-provider AI routing with automatic fallback:
 *   1. Groq         — primary (fastest, 20K–6K TPM free tier)
 *   2. DeepSeek     — fallback #1 (OpenAI-compatible, generous limits)
 *   3. OpenRouter   — fallback #2 (free :free models, no credits needed)
 *   4. Gemini       — fallback #3 (Google, high rate limits, different API format)
 *
 * Web search      : DuckDuckGo HTML (free, no key) + Brave Search API (if key set)
 *                   → Deep-crawls top 2 results via Jina for full page content
 *                   → Retries with refined query when <3 sources found
 * Web crawling    : Jina AI Reader — auto-detected URLs in messages → clean markdown
 * Cross-session   : User memory stored in engagera_user_memory, injected on every request
 * Memory learning : After each chat, facts about the user are extracted and saved
 * Accuracy        : Search-first by default; AI forbidden from stating unverified facts
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
  { provider: "groq",   model: "llama-3.1-8b-instant" },      // fastest — good enough for SVG
  { provider: "groq",   model: "llama-3.3-70b-versatile" },   // richer SVG if 8b fails
  { provider: "gemini", model: "gemini-1.5-flash-latest" },   // fast Gemini fallback
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

// ── Image-gen keyword / pattern lists (CONSERVATIVE) ─────────────────────────
// Only triggers when the user unambiguously requests visual image output.
// "generate", "create", "make", "design" alone do NOT trigger — they must be
// clearly paired with an explicit image noun.  This prevents the slow image-gen
// path from firing on normal chat like "please generate a Python function" or
// "can you create an API" or "picture of the problem".
const IMAGE_GEN_KEYWORDS = [
  // generate + explicit image noun
  "generate an image","generate a image","generate a picture","generate the picture",
  "generate a photo","generate the photo","generate artwork","generate an artwork",
  "generate some art","generate an illustration","generate a illustration",
  "generate a logo","generate the logo","generate a wallpaper","generate wallpaper",
  "generate a poster","generate poster","generate a banner","generate banner",
  "generate a thumbnail","generate thumbnail","generate a drawing",
  // create + explicit image noun
  "create an image","create a image","create a picture","create the picture",
  "create a photo","create the photo","create artwork","create an artwork",
  "create an illustration","create a illustration","create a logo","create the logo",
  "create a wallpaper","create wallpaper","create a poster","create poster",
  "create a banner","create banner","create a thumbnail","create thumbnail",
  "create a drawing",
  // make + explicit image noun
  "make an image","make a image","make me an image","make me a image",
  "make a picture","make me a picture","make a photo","make me a photo",
  "make artwork","make me artwork","make me art",
  "make an illustration","make a illustration","make a logo","make me a logo",
  "make a drawing","make me a drawing",
  // draw/paint/sketch — inherently visual verbs
  "draw me","draw a ","draw an ","paint a ","paint an ","paint me",
  "sketch a ","sketch an ","sketch me",
  // illustrate / render — inherently visual
  "illustrate this","illustrate a","illustrate me","please illustrate",
  "render a ","render an ","render me",
  // design + explicit image noun
  "design a logo","design the logo","design an image","design a poster",
  "design the poster","design a banner","design the banner",
  "design a thumbnail","design a wallpaper",
  // "show me a/an" + explicit image noun
  "show me a picture","show me an image","show me a photo",
  "show me a drawing","show me a painting","show me an illustration","show me a logo",
];

const IMAGE_GEN_PATTERNS: RegExp[] = [
  // draw/paint/sketch/illustrate/render — inherently visual verbs
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,
  // generate/create/make/produce + image noun within 50 chars of the verb
  /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic)\b/i,
  // "can/could/please you draw/paint/sketch/illustrate/render" — only visual verbs, NOT create/make/generate/design
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render)\b/i,
  // "I want/need/would like a/an [image noun]"
  /\b(i want|i need|i'd like|give me)\s+(a\s+|an\s+)(image|picture|photo|drawing|illustration|painting|artwork)\b/i,
];

// ── System prompts ────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Engagera — a powerful intelligence system built by the AfuAI / Engagera team. You are not a chatbot. You are not a simple assistant. You are a continuously-learning, research-capable, memory-powered AI system.

## Identity
- Built by the AfuAI / Engagera team. Never claim to be ChatGPT, Claude, Gemini, Llama, or any other AI brand.
- If asked who built you: "I was built by the AfuAI / Engagera team."
- If asked about your underlying model: "I'm powered by advanced language models optimised for the Engagera platform."

## About AfuChat, Engagera & AfuAI — Known Facts (always accurate)
You are part of the AfuAI product family. These facts are verified and you MUST use them when asked:

**AfuChat** (afuchat.com) — Africa's #1 Super App
- Tagline: "One App. Infinite Possibilities. Built for Africa, loved by the world."
- A unified super-app combining: Smart Messaging (E2E-encrypted DMs, group chats, voice notes, video calls, disappearing messages), AI Assistant (built-in personal AI for translation, summarisation, content generation), AfuPay Payments (P2P money transfers, bill payments, airtime, expense splitting), Groups & Channels (up to thousands of members, admin tools, polls, scheduled broadcasts), Shorts & Stories (vertical short-form video, 24-hour stories, trending creators), Prestige & Rewards (XP system, grades from Rookie to Legend, Nexa coins, Platinum perks).
- Stats: 50,000+ active users · 25+ countries · 1,000,000+ messages per day · 4.8★ app rating
- Available on Android (Google Play), iOS (App Store), and web
- Founder / team: AfuChat team (AfuAI division)

**Engagera** (engagera.afuchat.com) — Developer AI Platform under AfuAI
- A unified AI API and developer dashboard giving developers access to 6 branded AI models (engagera-lite, pro, reason, code, vision, voice) through a single REST API
- Features: API key management, usage analytics, billing dashboard, AI playground, SDK documentation
- Part of the AfuAI ecosystem alongside AfuChat

**AfuAI** — the AI division of AfuChat, responsible for both the in-app AI assistant and the Engagera developer platform.

## What You Can Do
- **Autonomous research**: Search the web in real-time, read any URL, cross-reference multiple sources, synthesise findings.
- **Deep reasoning**: Multi-step logic, mathematical proofs, scientific analysis, legal/ethical reasoning, strategic planning.
- **Code mastery**: Write, debug, explain, and optimise code in any language. Build full systems, not just snippets.
- **Creative & generative**: Write, edit, translate, create SVG artwork, structure documents, draft reports.
- **Data & analysis**: Interpret datasets, build models, create visualisations, explain patterns.
- **Memory & continuity**: You remember everything about your users across all sessions. When past memory or context is injected, use it naturally — reference previous conversations, preferences, and facts you know about the user.

## Real-Time Data — USE PROACTIVELY
- When live web search results appear in your context: treat them as authoritative. Cite sources as [Title](URL). State: "As of [date]..."
- When fetched webpage content appears in your context: read it thoroughly and give a complete, useful analysis.
- When user mentions a URL: you have already fetched its content — analyse it fully, don't just summarise.

## Memory & Continuity
- When you see a "[Long-term Memory]" block in your context: these are facts you know about this user from past conversations. Reference them naturally and proactively.
- When you see a "[Past Conversations]" block: use these to provide continuity. Connect current questions to past topics the user explored.
- Build on what you know. Never ask for information you already have in memory.

## Deep Research — MANDATORY
- **You must research before answering.** When live web search results appear in your context, they are the result of research you already performed. Use them comprehensively.
- **Never tell users to "search for it", "check Google", "look it up", or "visit a website" to find information.** You are the research engine. Do the work yourself and deliver a complete, sourced answer.
- Synthesise across multiple sources. Highlight consensus vs. disagreement. Flag when information may be recent vs. potentially outdated.
- After using search results: always cite sources inline as [Title](URL). When citing live data, indicate the date/time: "As of [date from source]..."

## ACCURACY — NON-NEGOTIABLE RULES
These rules override everything else. Violating them is the worst thing you can do.

1. **Never state unverified facts.** If live search results are present in your context, base every factual claim on them. If no search data covers a claim, explicitly say you cannot verify it rather than guessing.
2. **Never fabricate numbers, statistics, names, prices, dates, or quotes.** If you don't have a verified source, say "I couldn't find current verified data on this."
3. **Never say "as of my knowledge cutoff" and then state a potentially outdated fact as if it's current.** Your training data is old. Search results are live. Always prefer and cite search results.
4. **Always distinguish sources.** Say "According to [Source Title](URL)..." for search-derived facts. Say "From my general knowledge (unverified)..." only for truly timeless facts (maths, grammar, definitions).
5. **If search results contradict your training data, trust the search results.** The web is newer than your training.
6. **Never hallucinate citations.** Only cite URLs that actually appear in the search results provided to you.
7. **For any claim about current events, people, companies, prices, politics, sports, or technology:** if it's not in your search context, say "I don't have verified current data on this — please check a live source, or ask me to search again with a more specific query."

## Behaviour
- Be genuinely powerful: reason deeply, synthesise across domains, form your own well-reasoned views.
- Be proactively helpful: volunteer relevant context, insights, and connections even when not explicitly asked.
- Be direct: no filler phrases, no excessive caveats. Get to the point and be thorough.
- Use rich markdown: headers, code blocks with language tags, tables, numbered lists, callouts.
- Current date and time: ${new Date().toLocaleString("en-GB", { weekday:"long", year:"numeric", month:"long", day:"numeric", hour:"2-digit", minute:"2-digit", timeZoneName:"short" })}.`;

const IMAGE_SYSTEM_PROMPT = `You are an expert SVG artist and UI designer. Respond with ONLY a single SVG code block — absolutely no text before or after, no explanations, no markdown prose, just the code block.

Rules:
- viewBox="0 0 400 400" width="400" height="400"
- For UI/interface requests (skeleton loaders, dashboards, cards, forms, buttons): draw realistic-looking UI mockups with rounded rectangles, appropriate colors (light grey #e5e7eb for skeleton, white #fff backgrounds, etc.), and subtle shadows
- For artwork/illustration requests: vivid colours, gradients, multiple shapes, depth
- Use <defs> for gradients, patterns, or clipPaths when they add quality
- SVG <animate> or <animateTransform> are allowed for loaders, spinners, or pulsing effects
- No <script> tags, no external image/font resources
- Keep total elements under 70 to stay within token budget
- Make it look polished and professional — not sparse

Respond EXACTLY in this format (absolutely nothing else before or after):
\`\`\`svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <!-- content here -->
</svg>
\`\`\``;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Source type ───────────────────────────────────────────────────────────────
interface Source {
  title: string;
  url:   string;
  snippet: string;
}

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
      await new Promise((r) => setTimeout(r, 1000));
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
        signal: AbortSignal.timeout(25_000),
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
      signal: AbortSignal.timeout(25_000),
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
async function webSearch(query: string, braveKey?: string): Promise<{ text: string; sources: Source[] }> {
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
          const sources: Source[] = results.map((r) => ({
            title: r.title, url: r.url, snippet: r.description,
          }));
          const lines = results.map((r, i) =>
            `${i+1}. **${r.title}**${r.age ? ` (${r.age})` : ""}\n   ${r.description}\n   URL: ${r.url}`
          );
          return { text: `Search results for "${query}":\n\n${lines.join("\n\n")}`, sources };
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

    if (!res.ok) return { text: `Search unavailable (HTTP ${res.status}). Try rephrasing.`, sources: [] };

    const html = await res.text();
    const results: Source[] = [];

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
      return { text: `Search results for "${query}":\n\n${lines.join("\n\n")}`, sources: results };
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
      const sources: Source[] = [];
      if (ia.AbstractText) {
        parts.push(`${ia.AbstractText}\nSource: ${ia.AbstractURL ?? ""}`);
        if (ia.AbstractURL) sources.push({ title: query, url: ia.AbstractURL, snippet: ia.AbstractText });
      }
      (ia.RelatedTopics ?? []).slice(0, 5).forEach((t) => {
        if (t.Text) {
          parts.push(`• ${t.Text}${t.FirstURL ? `  URL: ${t.FirstURL}` : ""}`);
          if (t.FirstURL) sources.push({ title: t.Text.slice(0, 80), url: t.FirstURL, snippet: t.Text });
        }
      });
      if (parts.length > 0) return { text: `Results for "${query}":\n\n${parts.join("\n\n")}`, sources };
    }

    return { text: `No results found for "${query}". Try a different query.`, sources: [] };
  } catch (err) {
    return { text: `Search failed: ${String(err)}`, sources: [] };
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
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return `Could not fetch "${url}" (HTTP ${res.status}).`;
    const text = await res.text();
    return text.length > 3000 ? text.slice(0, 3000) + "\n\n[Content truncated at 3000 chars — full page is longer]" : text;
  } catch (err) {
    return `Failed to fetch page: ${String(err)}`;
  }
}

// ── URL detector ──────────────────────────────────────────────────────────────
function detectURLs(text: string): string[] {
  const urlRe = /https?:\/\/[^\s<>"{}|\\^`\[\]()]+/gi;
  const matches = text.match(urlRe) ?? [];
  // Deduplicate and ignore common non-content URLs (social share links, etc.)
  const ignored = /\/(share|tweet|intent|login|signup|oauth|auth|redirect)/i;
  return [...new Set(matches)].filter((u) => !ignored.test(u)).slice(0, 2);
}

// ── Cross-session user context loader ────────────────────────────────────────
async function loadUserContext(
  db: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  try {
    const [memResult, convResult] = await Promise.allSettled([
      db.from("engagera_user_memory")
        .select("key, value, strength")
        .eq("user_id", userId)
        .order("strength", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(12),
      db.from("engagera_conversations")
        .select("title, model, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(8),
    ]);

    const parts: string[] = [];

    if (memResult.status === "fulfilled" && !memResult.value.error) {
      const mems = (memResult.value.data ?? []) as { key: string; value: string; strength: number }[];
      if (mems.length > 0) {
        const lines = mems
          .filter((m) => m.value && m.strength >= 2)
          .map((m) => `• [${m.key}] ${m.value}`);
        if (lines.length > 0) {
          parts.push(`**What I know about you from our past conversations:**\n${lines.join("\n")}`);
        }
      }
    }

    if (convResult.status === "fulfilled" && !convResult.value.error) {
      const convs = (convResult.value.data ?? []) as { title: string; model: string; updated_at: string }[];
      if (convs.length > 0) {
        const now = Date.now();
        const lines = convs.map((c) => {
          const daysAgo = Math.floor((now - new Date(c.updated_at).getTime()) / 86_400_000);
          const when = daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo}d ago`;
          return `• "${c.title}" (${when})`;
        });
        parts.push(`**Your recent conversations:**\n${lines.join("\n")}`);
      }
    }

    if (parts.length === 0) return "";
    return `\n\n---\n[Long-term Memory & Context — injected from your history]\n${parts.join("\n\n")}\n---`;
  } catch {
    return "";
  }
}

// ── Memory extractor: learn from every conversation (fire-and-forget) ─────────
async function extractAndSaveMemory(
  db: ReturnType<typeof createClient>,
  userId: string,
  userMessage: string,
  assistantReply: string,
  keys: ProviderKeys,
  requestId: string,
): Promise<void> {
  // Only process substantive messages
  if (!userMessage || userMessage.length < 15 || !assistantReply) return;

  try {
    const extractMsgs: ChatMessage[] = [
      {
        role: "system",
        content:
          "You are a memory extraction system. Given a user message and assistant reply, extract ONLY durable facts about the USER (not the assistant). Return a raw JSON array — no markdown, no explanation. Each item: {\"key\":\"preference|fact|skill|goal|context\",\"value\":\"brief fact about the user (max 100 chars)\",\"strength\":2-5}. strength: 5=core identity/profession, 4=major preference, 3=useful context, 2=minor detail. Only extract strength≥3 facts. If nothing notable, return []. Keep value concise.",
      },
      {
        role: "user",
        content: `User said: "${userMessage.slice(0, 400)}"\nAssistant: "${assistantReply.slice(0, 200)}"\n\nExtract user facts:`,
      },
    ];

    const result = await callWithFallback(STANDARD_CHAIN, keys, extractMsgs, 300, requestId + "_mem");
    if (!result.ok || !result.content.trim()) return;

    let facts: { key: string; value: string; strength: number }[] = [];
    try {
      const raw = result.content.trim().replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      facts = parsed;
    } catch {
      return;
    }

    for (const fact of facts.slice(0, 4)) {
      if (!fact.value || typeof fact.value !== "string") continue;
      const value    = fact.value.trim().slice(0, 150);
      const key      = ["preference", "fact", "skill", "goal", "context"].includes(fact.key) ? fact.key : "fact";
      const strength = Math.max(2, Math.min(5, Math.round(Number(fact.strength)) || 3));
      if (strength < 3) continue;

      try {
        // Check for close duplicate (same first 40 chars)
        const { data: existing } = await db
          .from("engagera_user_memory")
          .select("id, strength")
          .eq("user_id", userId)
          .ilike("value", `${value.slice(0, 40)}%`)
          .limit(1);

        if (existing && existing.length > 0) {
          const better = Math.max(existing[0].strength, strength);
          await db.from("engagera_user_memory")
            .update({ strength: better, updated_at: new Date().toISOString() })
            .eq("id", existing[0].id);
        } else {
          await db.from("engagera_user_memory").insert({
            user_id: userId, key, value, strength,
            updated_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
          });
        }
      } catch { /* non-fatal */ }
    }
  } catch { /* non-fatal */ }
}

// ── Search SKIP patterns — only skip for pure code / math / creative writing ──
// Keep this list NARROW. When in doubt, search.
const NO_SEARCH_PATTERNS: RegExp[] = [
  // Pure math / logic (no factual lookup needed)
  /^(calculate|compute|solve|prove|evaluate|simplify|differentiate|integrate|factorise|factorize)\b/i,
  // Pure creative writing (no factual data needed)
  /^(write me a (poem|song|story|joke|essay|riddle|limerick)|tell me a (joke|riddle)|compose a (poem|song))/i,
  // Code-only tasks that don't mention real-world facts
  /^(fix (this|my|the) (bug|code|error|function)|debug (this|my)|refactor (this|my)|explain (this|my) code|what does this code|how does this code|convert (this|my) code)/i,
  // Greetings / meta questions about the AI
  /^(hi|hello|hey|thanks|thank you|good morning|good evening|good night|how are you|what can you do|what are you|who are you|are you|can you help)\b/i,
  // Pure grammar / spelling / translation
  /^(translate|grammar|spell|proofread|check grammar|fix grammar|correct (this|my) (sentence|text|paragraph))\b/i,
];

// ── Build a clean, focused search query ───────────────────────────────────────
function buildSearchQuery(userText: string, conversationContext?: string): string {
  let q = userText
    .replace(/please|could you|can you|would you|kindly|i want to know|i'd like to know|i need to know|give me|find me|search for|look up/gi, "")
    .replace(/\s+/g, " ").trim()
    .slice(0, 180);

  // If the question is very short, append context from conversation
  if (q.length < 30 && conversationContext) {
    q = `${q} ${conversationContext}`.slice(0, 180);
  }

  return q;
}

// ── Default: search for EVERYTHING except the narrow skip list above ───────────
function needsWebSearch(messages: ChatMessage[]): string | null {
  const last = [...messages].reverse().find((m) => m.role === "user");
  if (!last) return null;
  const text = typeof last.content === "string" ? last.content : "";
  if (!text || text.length < 6) return null;

  const trimmed = text.trim();

  // Skip only for the narrow list of pure code/math/creative tasks
  for (const re of NO_SEARCH_PATTERNS) {
    if (re.test(trimmed)) return null;
  }

  // Skip if it's a pure code block (likely debugging/review, not factual)
  if ((text.match(/```/g) ?? []).length >= 2) return null;

  // Skip very short imperative commands that are clearly about editing text
  if (trimmed.length < 25 && /^(summarise|summarize|rewrite|rephrase|shorter|longer|expand|continue|more|less)\b/i.test(trimmed)) return null;

  // Everything else → search for real-world grounding
  return text;
}

// ── Agentic chat: URL crawl + pre-search + multi-provider call ───────────────
async function agenticChat(
  keys: ProviderKeys,
  chain: ProviderModel[],
  messages: ChatMessage[],
  requestId: string,
  braveKey?: string,
): Promise<{ reply:string; inputTokens:number; outputTokens:number; provider?:string; providerModel?:string; searchInfo?: { query:string; sources:Source[] }; crawledUrls?: string[] }> {
  let baseConvo: ChatMessage[] = [...messages];

  // Step 0 — Auto-detect and fetch URLs mentioned in the user's message
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastUserText = lastUser ? (typeof lastUser.content === "string" ? lastUser.content : getTextPreview(lastUser.content as MessageContent)) : "";

  let crawledUrls: string[] = [];
  if (lastUserText) {
    const urls = detectURLs(lastUserText);
    if (urls.length > 0) {
      log("info", "url_crawl.start", { requestId, urls });
      try {
        const fetched = await Promise.allSettled(urls.map((u) => fetchWebpage(u).then((content) => ({ url: u, content }))));
        const urlParts: string[] = [];
        for (const r of fetched) {
          if (r.status === "fulfilled" && !r.value.content.startsWith("Could not") && !r.value.content.startsWith("Failed") && !r.value.content.startsWith("Invalid")) {
            urlParts.push(`### Content from: ${r.value.url}\n\n${r.value.content}`);
            crawledUrls.push(r.value.url);
          }
        }
        if (urlParts.length > 0) {
          const crawlBlock = `\n\n---\n🔗 **Fetched webpage content** (live, retrieved just now):\n\n${urlParts.join("\n\n---\n\n")}\n---\n\nAnalyse the above content thoroughly to answer the user's question.`;
          const newConvo = [...baseConvo];
          const sysIdx = newConvo.findIndex((m) => m.role === "system");
          if (sysIdx >= 0 && typeof newConvo[sysIdx].content === "string") {
            newConvo[sysIdx] = { ...newConvo[sysIdx], content: (newConvo[sysIdx].content as string) + crawlBlock };
          } else {
            newConvo.unshift({ role: "system", content: crawlBlock });
          }
          baseConvo = newConvo;
          log("info", "url_crawl.done", { requestId, count: crawledUrls.length });
        }
      } catch (err) {
        log("warn", "url_crawl.exception", { requestId, error: String(err) });
      }
    }
  }

  // Step 1 — Real-world grounding: search + deep-crawl top results
  const userText = needsWebSearch(messages);

  if (userText) {
    try {
      // Build the conversation context for short queries
      const recentContext = messages
        .filter((m) => m.role === "user")
        .slice(-3)
        .map((m) => (typeof m.content === "string" ? m.content : ""))
        .join(" ").slice(0, 120);

      const query = buildSearchQuery(userText, recentContext);
      log("info", "pre_search.start", { requestId, query });

      let searchResult = await webSearch(query, braveKey);
      log("info", "pre_search.done", { requestId, sourceCount: searchResult.sources.length });

      // ── Retry with a simplified query if we got < 3 sources ─────────────────
      if (searchResult.sources.length < 3) {
        const shortQuery = query.split(/\s+/).slice(0, 6).join(" ");
        if (shortQuery.length > 8 && shortQuery !== query.trim()) {
          log("info", "pre_search.retry", { requestId, shortQuery });
          const retry = await webSearch(shortQuery, braveKey);
          if (retry.sources.length > searchResult.sources.length) {
            searchResult = retry;
            log("info", "pre_search.retry_better", { requestId, sourceCount: retry.sources.length });
          }
        }
      }

      // ── Domain-crawl fallback when search returns 0 results ──────────────────
      // Some brands (e.g. AfuChat) are not indexed by DuckDuckGo yet.
      // When the query mentions a known brand, crawl the official site directly.
      if (searchResult.sources.length === 0) {
        const knownDomains: Array<{ keywords: string[]; url: string; name: string }> = [
          { keywords: ["afuchat", "afu chat"], url: "https://afuchat.com", name: "AfuChat" },
          { keywords: ["engagera"], url: "https://engagera.afuchat.com", name: "Engagera" },
          { keywords: ["afuai", "afu ai"], url: "https://afuchat.com", name: "AfuAI" },
        ];
        const queryLower = query.toLowerCase();
        for (const { keywords, url, name } of knownDomains) {
          if (keywords.some((kw) => queryLower.includes(kw))) {
            log("info", "domain_crawl_fallback.start", { requestId, url });
            try {
              const content = await fetchWebpage(url);
              if (content.length > 200 && !content.startsWith("Could not") && !content.startsWith("Failed")) {
                searchResult = {
                  text: `Direct website crawl of ${url} (retrieved just now):\n\n${content.slice(0, 2500)}`,
                  sources: [{ title: `${name} — Official Website`, url, snippet: content.slice(0, 300) }],
                };
                log("info", "domain_crawl_fallback.done", { requestId, url, bytes: content.length });
              }
            } catch { /* non-fatal */ }
            break;
          }
        }
      }

      const hasResults = searchResult.sources.length > 0 ||
        (!searchResult.text.startsWith("No results") && !searchResult.text.startsWith("Search unavailable") && !searchResult.text.startsWith("Search failed"));

      if (hasResults) {
        // ── Deep-crawl the top 2 sources for full page content ────────────────
        const topUrls = searchResult.sources
          .slice(0, 2)
          .map((s) => s.url)
          .filter((u) => u && u.startsWith("http") && !u.includes("youtube.com") && !u.includes("twitter.com") && !u.includes("facebook.com"));

        const deepParts: string[] = [];
        if (topUrls.length > 0) {
          log("info", "deep_crawl.start", { requestId, urls: topUrls });
          const crawled = await Promise.allSettled(
            topUrls.map((u) => fetchWebpage(u).then((content) => ({ url: u, content })))
          );
          for (const r of crawled) {
            if (r.status === "fulfilled") {
              const { url, content } = r.value;
              const bad = ["Could not fetch", "Failed to fetch", "Invalid URL", "Search unavailable"];
              if (!bad.some((b) => content.startsWith(b)) && content.length > 200) {
                deepParts.push(`### Full content from: ${url}\n\n${content.slice(0, 2500)}`);
              }
            }
          }
          log("info", "deep_crawl.done", { requestId, fetched: deepParts.length });
        }

        // ── Build context block: snippets + deep-crawled content ──────────────
        const snippetBlock = `🌐 **Live search results** (retrieved just now — ${new Date().toUTCString()}):\n\n${searchResult.text.slice(0, 2000)}`;
        const deepBlock    = deepParts.length > 0
          ? `\n\n📄 **Full page content from top sources** (deep-crawled just now):\n\n${deepParts.join("\n\n---\n\n")}`
          : "";
        const contextBlock = `\n\n---\n${snippetBlock}${deepBlock}\n\n---\n\n` +
          `INSTRUCTIONS: Base your answer on the above real-world data. ` +
          `Cite every factual claim as [Title](URL). ` +
          `If the data above doesn't cover something the user asked about, say so honestly — do NOT fill in gaps from training memory.`;

        const convo: ChatMessage[] = [...baseConvo];
        const sysIdx = convo.findIndex((m) => m.role === "system");
        if (sysIdx >= 0 && typeof convo[sysIdx].content === "string") {
          convo[sysIdx] = { ...convo[sysIdx], content: (convo[sysIdx].content as string) + contextBlock };
        } else {
          convo.unshift({ role: "system", content: contextBlock });
        }

        // Use the premium chain for search-augmented calls — accuracy matters most here
        const result = await callWithFallback(PREMIUM_CHAIN, keys, convo, 4096, requestId);
        if (result.ok) {
          log("info", "search_chat.success", { requestId, provider: result.provider, deepCrawled: deepParts.length });
          return {
            reply: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
            provider: result.provider, providerModel: result.model,
            searchInfo: { query, sources: searchResult.sources.slice(0, 8) },
            ...(crawledUrls.length && { crawledUrls }),
          };
        }
        log("warn", "search_chat.ai_failed", { requestId, errorDetail: result.errorDetail });
        // Fall through to no-search call below
      } else {
        log("info", "pre_search.no_results", { requestId, text: searchResult.text.slice(0, 80) });
      }
    } catch (err) {
      log("warn", "search_path.exception", { requestId, error: String(err) });
    }
  }

  // No search, or search failed — use the model's own chain with the original messages
  const result = await callWithFallback(chain, keys, baseConvo, 4096, requestId);
  if (result.ok) {
    return {
      reply: result.content, inputTokens: result.inputTokens, outputTokens: result.outputTokens,
      provider: result.provider, providerModel: result.model,
      ...(crawledUrls.length && { crawledUrls }),
    };
  }

  return {
    reply: "I'm having trouble connecting to the AI service right now. Please try again in a moment.",
    inputTokens: 0, outputTokens: 0,
    ...(crawledUrls.length && { crawledUrls }),
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
      const result = await callWithFallback(IMAGE_CHAIN, keys, svgMsgs, 1500, requestId);
      if (result.ok && (result.content.includes("```svg") || result.content.includes("<svg"))) {
        reply = result.content;
        inputTokens = result.inputTokens; outputTokens = result.outputTokens;
        totalTokens = inputTokens + outputTokens;
      } else {
        reply = "I wasn't able to generate that image right now. Please try again.";
        logEntry.error_code = `image_gen_failed: ${result.errorDetail ?? "no svg block"}`;
      }
    } else {
      // Load cross-session user context (memories + recent conv titles) for authed users
      let userContextBlock = "";
      if (userId) {
        userContextBlock = await loadUserContext(db, userId);
      }

      const systemContent = [
        SYSTEM_PROMPT,
        userContextBlock,
        contextHint ? `\n\n[Additional user context] ${contextHint}` : "",
      ].join("");

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

      if (chatResult.searchInfo) {
        logEntry.search_query   = chatResult.searchInfo.query;
        logEntry.source_count   = chatResult.searchInfo.sources.length;
      }
      if (chatResult.crawledUrls?.length) {
        logEntry.crawled_urls = chatResult.crawledUrls.join(",");
      }

      log("info", "chat.complete", {
        requestId, replyLen: reply.length,
        inputTokens, outputTokens,
        provider: chatResult.provider,
        providerModel: chatResult.providerModel,
        searchQuery: chatResult.searchInfo?.query,
        crawledUrls: chatResult.crawledUrls,
      });

      // Store for response
      (logEntry as any)._searchInfo   = chatResult.searchInfo;
      (logEntry as any)._crawledUrls  = chatResult.crawledUrls;

      // Fire-and-forget: extract and save user memories from this exchange
      if (userId && lastUserMsg && reply) {
        const userMsgText = typeof lastUserMsg.content === "string"
          ? lastUserMsg.content : getTextPreview(lastUserMsg.content);
        extractAndSaveMemory(db, userId, userMsgText, reply, keys, requestId).catch(() => {});
      }
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
        // Save user message first (correct chronological order), then assistant reply
        if (lastUserMsg) {
          const userText = typeof lastUserMsg.content === "string"
            ? lastUserMsg.content : JSON.stringify(lastUserMsg.content);
          await db.from("engagera_messages").insert({
            conversation_id: convId, role: "user", content: userText, token_count: 0,
          }).catch(() => {});
        }
        await Promise.allSettled([
          db.from("engagera_messages").insert({
            conversation_id: convId, role: "assistant", content: reply, token_count: totalTokens,
          }),
          db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
        ]);
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

    const searchInfo   = (logEntry as any)._searchInfo  as { query:string; sources:Source[] } | undefined;
    const crawledUrls  = (logEntry as any)._crawledUrls as string[] | undefined;

    return json({
      id: requestId, model,
      message: { role: "assistant", content: reply },
      usage: { inputTokens, outputTokens, totalTokens },
      conversationId: convId,
      ...(searchInfo   && { searchInfo }),
      ...(crawledUrls?.length && { crawledUrls }),
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT,
      }),
    });

  } catch (err) {
    log("error", "handler.unhandled", { requestId, error: String(err) });
    return json({ error: "Internal server error" }, 500);
  }
});
