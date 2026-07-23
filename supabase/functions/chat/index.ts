import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function — v13 (2026-07-22)
 *
 * New in v13:
 *  - OpenAI GPT-4o as primary provider (with graceful fallback)
 *  - User settings: custom system prompt, preferred model, agent mode
 *  - Long-term memory: load top memories, extract new facts after each chat
 *  - RAG: search user's knowledge-base documents (full-text) for context
 *  - Tools: calculator (safe math eval) + code execution (Piston API)
 *  - Autonomous agent loop: up to 3 tool-use iterations before final reply
 *  - TTS voice preference respected by frontend via settings
 */

// ── Provider URLs ─────────────────────────────────────────────────────────────
const OPENAI_URL   = "https://api.openai.com/v1/chat/completions";
const GROQ_URL     = "https://api.groq.com/openai/v1/chat/completions";
const CEREBRAS_URL = "https://api.cerebras.ai/v1/chat/completions";
const CF_BASE      = "https://api.cloudflare.com/client/v4/accounts";
const PISTON_URL   = "https://emkc.org/api/v2/piston/execute";

const GUEST_LIMIT  = 5;
const AGENT_MAX_ITER = 3;

// Tool call markers used in the system prompt
const TOOL_CALL_OPEN  = "<tool_call>";
const TOOL_CALL_CLOSE = "</tool_call>";
const TOOL_RESULT_TAG = "<tool_result>";

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
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
type MessageContent = string | ContentPart[];

interface IncomingMessage { role: string; content: MessageContent; }
interface ChatMessage { role: string; content: string; }
interface AIResult {
  ok: boolean; content: string; inputTokens: number; outputTokens: number;
  provider?: string; model?: string; error?: string;
}
interface SearchSource { title: string; url: string; snippet: string; image?: string; }
interface WeatherInfo {
  label: string; tempC: number; feelsLikeC: number; condition: string; icon: string;
  windKph: number; humidity: number; isDay: boolean;
}
interface TimeInfo { ianaZone: string; label: string; }
interface UserSettings {
  customSystemPrompt?: string;
  preferredModel?: string;
  preferredVoice?: string;
  agentModeEnabled?: boolean;
}
interface Memory { id: number; content: string; importance: number; }
interface ToolCall { name: string; args: Record<string, unknown>; }
interface ToolResult { name: string; output: string; error?: boolean; }

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

function sseFrame(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── Calculator — safe math eval ───────────────────────────────────────────────
function evalMath(expr: string): string | null {
  const safe = expr.replace(/\s/g, "");
  // Only allow digits, basic operators, parentheses, decimals, constants
  if (!/^[\d+\-*/().,^%]+$/.test(safe.replace(/Math\.[a-z]+/gi, "0"))) return null;
  try {
    // eslint-disable-next-line no-new-func
    const result = new Function(`"use strict"; return (${safe.replace(/\^/g, "**")})`)();
    if (typeof result === "number" && isFinite(result)) {
      return Number.isInteger(result) ? String(result) : result.toFixed(8).replace(/\.?0+$/, "");
    }
    return null;
  } catch { return null; }
}

// ── Code execution — Piston API (80+ languages, no key required) ──────────────
async function executeCode(language: string, code: string, requestId: string): Promise<ToolResult> {
  try {
    const res = await fetch(PISTON_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language, version: "*", files: [{ content: code }] }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return { name: "code", output: "Code execution service unavailable. Try again later.", error: true };
    const data = (await res.json()) as {
      run?: { stdout?: string; stderr?: string; code?: number };
      message?: string;
    };
    if (data.message) return { name: "code", output: `Error: ${data.message}`, error: true };
    const stdout = (data.run?.stdout ?? "").trim();
    const stderr = (data.run?.stderr ?? "").trim();
    const exitCode = data.run?.code ?? 0;
    const output = [stdout, stderr].filter(Boolean).join("\n") || "(no output)";
    log("info", "code.executed", { requestId, language, exitCode, chars: output.length });
    return { name: "code", output: exitCode !== 0 ? `Exit ${exitCode}:\n${output}` : output };
  } catch (err) {
    log("warn", "code.error", { requestId, error: String(err) });
    return { name: "code", output: "Code execution timed out or failed.", error: true };
  }
}

// ── Agent tool parser ─────────────────────────────────────────────────────────
function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];
  const re = new RegExp(`${TOOL_CALL_OPEN}([\\s\\S]*?)${TOOL_CALL_CLOSE}`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as ToolCall;
      if (parsed.name) calls.push(parsed);
    } catch { /* malformed tool call */ }
  }
  return calls;
}

function stripToolCalls(text: string): string {
  return text
    .replace(new RegExp(`${TOOL_CALL_OPEN}[\\s\\S]*?${TOOL_CALL_CLOSE}`, "g"), "")
    .replace(new RegExp(`${TOOL_RESULT_TAG}[\\s\\S]*?</tool_result>`, "g"), "")
    .trim();
}

// ── DB helpers ────────────────────────────────────────────────────────────────
async function loadUserSettings(
  db: ReturnType<typeof createClient>,
  userId: string,
): Promise<UserSettings> {
  try {
    const { data } = await db
      .from("engagera_user_settings")
      .select("custom_system_prompt, preferred_model, preferred_voice, agent_mode_enabled")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return {};
    return {
      customSystemPrompt: data.custom_system_prompt ?? undefined,
      preferredModel:     data.preferred_model     ?? undefined,
      preferredVoice:     data.preferred_voice     ?? undefined,
      agentModeEnabled:   data.agent_mode_enabled  ?? false,
    };
  } catch { return {}; }
}

async function loadMemories(
  db: ReturnType<typeof createClient>,
  userId: string,
  limit = 8,
): Promise<Memory[]> {
  try {
    const { data } = await db
      .from("engagera_memories")
      .select("id, content, importance")
      .eq("user_id", userId)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit);
    return (data ?? []) as Memory[];
  } catch { return []; }
}

async function searchDocuments(
  db: ReturnType<typeof createClient>,
  userId: string,
  query: string,
): Promise<string> {
  try {
    const { data } = await db.rpc("engagera_search_chunks", {
      p_user_id: userId,
      p_query:   query.slice(0, 200),
      p_limit:   4,
    });
    if (!data?.length) return "";
    return (data as { document_title: string; chunk_text: string }[])
      .map((r, i) => `[Doc ${i + 1}: ${r.document_title}]\n${r.chunk_text}`)
      .join("\n\n");
  } catch { return ""; }
}

/** Returns true when the query is asking about the user's own knowledge base */
function isKnowledgeBaseQuery(text: string): boolean {
  const t = text.toLowerCase();
  return [
    "in my document", "from my file", "in my file", "according to my",
    "based on what i uploaded", "in the document", "from the pdf",
    "in my notes", "from my notes", "knowledge base", "my knowledge",
    "what i shared", "that i uploaded", "search my", "find in my",
  ].some((k) => t.includes(k));
}

// ── Extract & save memories (async, fire-and-forget) ─────────────────────────
async function extractAndSaveMemories(
  db: ReturnType<typeof createClient>,
  userId: string,
  userText: string,
  aiResponse: string,
  groqKey: string | undefined,
): Promise<void> {
  if (!groqKey || userText.length < 20) return;
  try {
    const prompt = `Given this exchange, extract 1-3 specific facts about the USER that are worth remembering for future conversations. Focus on: preferences, expertise, goals, personal context, profession, location, or opinions they stated.

User said: "${userText.slice(0, 400)}"
AI replied: "${aiResponse.slice(0, 200)}"

Rules:
- Only extract facts about the USER (not general knowledge)
- Be specific and concise: "User is a software engineer at a startup" not "User likes tech"
- Skip if there are no personal facts to extract
- Output ONLY a JSON array of strings, e.g. ["User prefers Python over JavaScript"] or []

JSON array:`;

    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = data.choices?.[0]?.message?.content?.trim() ?? "";
    // Extract JSON array from response
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return;
    const facts: string[] = JSON.parse(match[0]);
    if (!Array.isArray(facts) || facts.length === 0) return;
    const validFacts = facts.filter((f) => typeof f === "string" && f.trim().length > 10).slice(0, 3);
    if (validFacts.length > 0) {
      await db.rpc("engagera_add_memories", { p_user_id: userId, p_facts: validFacts });
    }
  } catch { /* non-fatal */ }
}

// ── Image helpers (unchanged from v12) ───────────────────────────────────────
function hasImageAttachment(msgs: IncomingMessage[]): boolean {
  const last = msgs.filter((m) => m.role === "user").at(-1);
  if (!last || typeof last.content === "string") return false;
  return last.content.some((p) => p.type === "image_url");
}

function extractLastImageUrl(msgs: IncomingMessage[]): string | null {
  const last = msgs.filter((m) => m.role === "user").at(-1);
  if (!last || typeof last.content === "string") return null;
  const part = last.content.find(
    (p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url",
  );
  return part?.image_url.url ?? null;
}

type ImageIntent = "edit" | "question" | "none";
function detectImageIntent(text: string): ImageIntent {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 3) return "none";
  const editPatterns = [
    /\b(edit|modify|change|alter|adjust|fix|update)\b/,
    /\b(crop|resize|rotate|flip|mirror|stretch|scale)\b/,
    /\b(add|remove|delete|erase|replace|put|insert|apply)\b/,
    /\b(color|recolor|colorize|brighten|darken|lighten)\b/,
    /\b(background|foreground|filter|effect|style|artistic|cartoon|anime)\b/,
    /\b(make\s+(it|this|the)\b)/,
  ];
  const questionPatterns = [
    /^(what|who|how|where|when|why|is|are|does|can|could|do|should|would)\b/,
    /\b(tell\s+me|describe|explain|analyze|identify|read|translate|summarize)\b/,
    /\?/,
  ];
  if (editPatterns.some((p) => p.test(t))) return "edit";
  if (questionPatterns.some((p) => p.test(t))) return "question";
  return "question";
}

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Invalid data URL");
  const b64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ── Image generation ──────────────────────────────────────────────────────────
function isCompleteImageRequest(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;
  const complete = [
    /\b(generate|create|make|produce|build)\s+(a\s+|an\s+|the\s+|me\s+a\s+|me\s+an\s+)?(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render)\s+(of|showing|depicting|featuring|about)\s+(a\s+|an\s+|the\s+)?\w{3,}/i,
    /\b(generate|create|make|produce|build)\b.{3,}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render|design)\b/i,
    /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|my\s+)?\w{3,}/i,
    /\bshow\s+me\s+(a|an|the)\s+(picture|image|photo|drawing|illustration)\s+of\s+\w{3,}/i,
    /\b(i\s+)?(want|need|would\s+like|give\s+me)\s+(a|an)\s+(image|picture|photo|drawing|illustration)\s+of\s+\w{3,}/i,
    /\b(image|picture|photo|illustration|artwork)\s+of\s+(a\s+|an\s+|the\s+)?\w{3,}/i,
  ];
  return complete.some((p) => p.test(t));
}

function looksLikeImageIntent(text: string): boolean {
  const t = text.toLowerCase();
  const keywords = [
    "generate an image", "generate a image", "generate a picture", "create an image", "create a picture",
    "make an image", "make me an image", "draw me", "draw a ", "draw an ", "paint a ", "paint an ",
    "sketch a ", "sketch an ", "render a ", "design a logo", "show me a picture", "show me an image",
  ];
  const patterns = [
    /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,
    /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner)\b/i,
  ];
  return keywords.some((k) => t.includes(k)) || patterns.some((p) => p.test(t));
}

async function b64FromResponse(res: Response): Promise<string | null> {
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    const d = (await res.json()) as { result?: { image?: string } };
    return d?.result?.image ?? null;
  }
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = ""; const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(binary);
}

async function generateImageCF(prompt: string, token: string, accountId: string, requestId: string): Promise<string | null> {
  const url = `${CF_BASE}/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, num_steps: 4 }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) return null;
    const b64 = await b64FromResponse(res);
    if (!b64) return null;
    log("info", "image_gen.success", { requestId });
    return `![Generated Image](data:image/png;base64,${b64})`;
  } catch (err) { log("warn", "image_gen.error", { requestId, error: String(err) }); return null; }
}

async function editImageCF(imageDataUrl: string, prompt: string, token: string, accountId: string, requestId: string): Promise<string | null> {
  const url = `${CF_BASE}/${accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`;
  try {
    const bytes = dataUrlToBytes(imageDataUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, image: Array.from(bytes), num_steps: 20, strength: 0.75, guidance: 7.5 }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const b64 = await b64FromResponse(res);
    return b64 ? `![Edited Image](data:image/png;base64,${b64})` : null;
  } catch (err) { log("warn", "img2img.error", { requestId, error: String(err) }); return null; }
}

// ── URL fetch ─────────────────────────────────────────────────────────────────
function extractUrls(text: string): string[] {
  const urlRe = /https?:\/\/[^\s<>"{}|\\^[\]`\u0000-\u001F]+/gi;
  const matches = [...text.matchAll(urlRe)].map((m) => m[0].replace(/[.,;:!?)]+$/, ""));
  return [...new Set(matches)].slice(0, 3);
}

async function fetchPageContent(url: string, requestId: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").trim();
    const body = cleaned.slice(0, 6000);
    return pageTitle ? `Page: ${pageTitle}\n\n${body}` : body;
  } catch { return null; }
}

// ── Weather & Time (unchanged from v12) ───────────────────────────────────────
function extractWeatherLocation(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (!/\b(weather|temperature|forecast|rain|snow|sunny|cloudy|humid|hot|cold|wind|storm)\b/i.test(t)) return null;
  const locMatch =
    text.match(/\b(?:weather|temperature|forecast)\b\s+(?:in|at|for|of)\s+([A-Za-z\s,]+?)(?:\?|$|,|\.|!)/i) ||
    text.match(/\b(?:in|at)\s+([A-Za-z\s,]{3,40}?)(?:'s)?\s+weather/i);
  return locMatch ? locMatch[1].trim() : null;
}

async function geocode(location: string): Promise<{ lat: number; lon: number; ianaZone: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
      { signal: AbortSignal.timeout(5_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { results?: { latitude: number; longitude: number; timezone: string; name: string; country?: string }[] };
    const r = data.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude, ianaZone: r.timezone, name: r.country ? `${r.name}, ${r.country}` : r.name };
  } catch { return null; }
}

function interpretWmo(code: number, isDay: boolean): { condition: string; icon: string } {
  if (code === 0) return { condition: isDay ? "Clear sky" : "Clear night", icon: "sun" };
  if (code <= 2) return { condition: "Partly cloudy", icon: "cloud-sun" };
  if (code === 3) return { condition: "Overcast", icon: "cloud" };
  if (code <= 49) return { condition: "Foggy", icon: "fog" };
  if (code <= 55) return { condition: "Drizzle", icon: "drizzle" };
  if (code <= 65) return { condition: "Rain", icon: "rain" };
  if (code <= 77) return { condition: "Snow", icon: "snow" };
  if (code <= 82) return { condition: "Rain showers", icon: "rain" };
  if (code <= 86) return { condition: "Snow showers", icon: "snow" };
  if (code >= 95) return { condition: "Thunderstorm", icon: "storm" };
  return { condition: "Cloudy", icon: "cloud" };
}

async function fetchWeather(location: string, requestId: string, preferredLabel?: string): Promise<WeatherInfo | null> {
  try {
    const geo = await geocode(location);
    if (!geo) return null;
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${geo.lat}&longitude=${geo.lon}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day` +
      `&timezone=auto&forecast_days=1`,
      { signal: AbortSignal.timeout(6_000) },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { current?: { temperature_2m?: number; apparent_temperature?: number; relative_humidity_2m?: number; wind_speed_10m?: number; weather_code?: number; is_day?: number } };
    const c = data.current;
    if (!c) return null;
    const isDay = (c.is_day ?? 1) === 1;
    const { condition, icon } = interpretWmo(c.weather_code ?? 0, isDay);
    return {
      label: preferredLabel ?? geo.name,
      tempC: Math.round(c.temperature_2m ?? 0),
      feelsLikeC: Math.round(c.apparent_temperature ?? 0),
      condition, icon,
      windKph: Math.round(c.wind_speed_10m ?? 0),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      isDay,
    };
  } catch { return null; }
}

function extractTimeLocation(text: string): string | null {
  if (!/\b(time|what time|current time|clock|timezone|what's the time|whats the time)\b/i.test(text)) return null;
  const loc =
    text.match(/\b(?:time\s+in|time\s+at|time\s+for|clock\s+in|what\s+time\s+is\s+it\s+in|what(?:'s|s)\s+the\s+time\s+in)\s+([A-Za-z\s,]+?)(?:\?|$|,|\.|!)/i) ||
    text.match(/\bin\s+([A-Za-z\s,]{3,30}?)(?:'s)?\s+(?:time|timezone)/i);
  return loc ? loc[1].trim() : "UTC";
}

async function fetchTimeInfo(location: string, requestId: string): Promise<TimeInfo | null> {
  if (/^utc$/i.test(location.trim())) return { ianaZone: "UTC", label: "UTC" };
  try {
    const geo = await geocode(location);
    if (!geo) return { ianaZone: "UTC", label: `UTC (couldn't find "${location}")` };
    return { ianaZone: geo.ianaZone, label: geo.name };
  } catch { return { ianaZone: "UTC", label: "UTC" }; }
}

// ── Web search (unchanged from v12) ──────────────────────────────────────────
async function webSearch(query: string, requestId: string): Promise<SearchSource[]> {
  try {
    const res = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=us-en`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return [];
    const html = await res.text();
    const linkRe = /<a\s[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a\s[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const links: { url: string; title: string }[] = [];
    const snippets: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = linkRe.exec(html)) !== null && links.length < 10) {
      let url = m[1];
      const uddg = url.match(/[?&]uddg=([^&]+)/);
      if (uddg) { try { url = decodeURIComponent(uddg[1]); } catch { continue; } }
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
    return results;
  } catch { return []; }
}

async function fetchOgImage(url: string): Promise<string | undefined> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Engagera/1.0)", Accept: "text/html" },
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return undefined;
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
      chunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
    const img = imgMatch?.[1]?.trim();
    return img?.startsWith("http") ? img : undefined;
  } catch { return undefined; }
}

async function enrichWithImages(sources: SearchSource[], maxEnrich = 4): Promise<SearchSource[]> {
  if (sources.length === 0) return sources;
  const toEnrich = sources.slice(0, maxEnrich);
  const rest = sources.slice(maxEnrich);
  const images = await Promise.all(toEnrich.map((s) => fetchOgImage(s.url)));
  return [...toEnrich.map((s, i) => (images[i] ? { ...s, image: images[i] } : s)), ...rest];
}

function needsWebSearch(text: string): boolean {
  const lower = text.toLowerCase().trim();
  if (looksLikeImageIntent(text)) return false;
  if (/^\s*(what(?:'s|\s+is|\s+was)?\s+the\s+time|what\s+time\s+is\s+it|current\s+time|time\s+now)\s*[\?!.]?\s*$/i.test(text.trim())) return false;
  if (/^(write (me |a |an |the )?|compose |draft |create a (story|poem|essay|letter|email))/i.test(text.trim())) return false;
  if (/^(calculate|compute|solve for|what is \d[\d\s+\-*/^()]*[=?]|simplify|integrate|differentiate)/i.test(text.trim())) return false;
  const triggers = [
    "latest", "recent", "today", "tonight", "yesterday", "this week", "this year",
    "news", "current", "now", "live", "update", "breaking", "2024", "2025", "2026", "2027",
    "price", "cost", "how much", "worth", "value", "rate", "stock", "crypto", "bitcoin",
    "score", "result", "standings", "winner", "who won", "match", "game", "election",
    "weather", "temperature", "forecast", "where is", "where are", "who is", "who are",
    "ceo of", "founder of", "release", "launch", "new model", "new version",
    "specs", "review", "vs ", " vs", "compare", "best ", "top ", "trending",
    "what is the ", "what are the ", "how many ", "statistics", "study", "research",
    "how to ", "steps to ", "tutorial", "guide", "near me", "open now", "hours",
  ];
  return triggers.some((t) => lower.includes(t));
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(opts: {
  mode: "dev" | "default";
  searchContext: string;
  urlContext: string;
  weatherContext: string;
  memories: Memory[];
  customSystemPrompt?: string;
  docContext?: string;
  agentModeEnabled?: boolean;
}): string {
  const { mode, searchContext, urlContext, weatherContext, memories, customSystemPrompt, docContext, agentModeEnabled } = opts;
  const dateStr = new Date().toISOString().slice(0, 10);

  const sharedRules = `Today's date is ${dateStr}.

Core rules — follow every one without exception:
- REAL-TIME ACCESS: You have live web search. Never say "as of my last update" or "I don't have real-time data" — you can and do check current events.
- HONESTY: If you have no data on something, say so explicitly. Never guess or hallucinate facts.
- CONCISE: Give exactly what was asked. Answer in 1–4 sentences for simple queries, use structure (bullets/headers) only when genuinely useful.
- INTENT: Understand why the user is asking before answering.
- URLS: Never include raw https:// URLs in response text. Refer to sources by domain/name only.
- NO MARKERS: Never show [source], [1], [SEARCH], or any implementation detail.
- CODE: Always use fenced code blocks with the correct language label.
- IMAGE PROMPTS: When asked to generate an image, tell them it's being generated and describe what you're creating. Never ask follow-up questions — generate immediately.
- TIME: A clock widget is already displayed in the UI. Just confirm in one sentence. Never search the web for time.
- WEATHER: A weather widget is already displayed. Briefly confirm conditions. Never search the web for weather.`.trim();

  // Memory section
  let memorySection = "";
  if (memories.length > 0) {
    memorySection = "\n\n## What you remember about this user:\n" +
      memories.map((m) => `- ${m.content}`).join("\n") +
      "\nUse this context to personalize your responses naturally — don't reference it explicitly unless relevant.";
  }

  // Custom system prompt
  let customSection = "";
  if (customSystemPrompt?.trim()) {
    customSection = `\n\n## User's personal instructions (follow these above all else):\n${customSystemPrompt.trim()}`;
  }

  // Document context
  let docSection = "";
  if (docContext?.trim()) {
    docSection = `\n\n## Relevant content from user's knowledge base:\n${docContext}\n(Use this to answer questions about their documents. Cite the document name.)`;
  }

  // Agent tools section
  let agentSection = "";
  if (agentModeEnabled) {
    agentSection = `\n\n## Agent Tools Available:
You can use tools by outputting a JSON tool call. ALWAYS put tool calls on their own line:
${TOOL_CALL_OPEN}{"name": "calculator", "args": {"expression": "2 + 2 * 3"}}${TOOL_CALL_CLOSE}
${TOOL_CALL_OPEN}{"name": "code", "args": {"language": "python", "code": "print('hello')"}}${TOOL_CALL_CLOSE}
${TOOL_CALL_OPEN}{"name": "search_docs", "args": {"query": "what does the document say about X"}}${TOOL_CALL_CLOSE}

Available tools:
- calculator: Evaluate math expressions. Args: {expression: string}
- code: Execute code. Args: {language: string, code: string}. Supported: python, javascript, typescript, bash, go, rust, java, cpp, c, ruby, php, swift, kotlin
- search_docs: Search user's knowledge base. Args: {query: string}

After tool results are shown, continue your response naturally.`;
  }

  let context = "";
  if (urlContext) context += `\n\nPage content retrieved from user's URL:\n${urlContext}`;
  if (searchContext) context += `\n\nLive web search results (use to inform your answer):\n${searchContext}`;
  if (weatherContext) context += `\n\nCurrent weather data:\n${weatherContext}`;

  const basePersona = mode === "dev"
    ? "You are Engagera Dev — an expert software engineering assistant built by AfuAI (AfuChat Technologies Limited). You help developers build production-quality software."
    : "You are Engagera — an advanced AI assistant built by AfuAI (AfuChat Technologies Limited). You are accurate, direct, and knowledgeable across all subjects.";

  return `${basePersona}\n${sharedRules}${memorySection}${customSection}${docSection}${agentSection}${context}`;
}

function formatSearchContext(sources: SearchSource[]): string {
  return sources.slice(0, 5).map((s, i) => {
    const host = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })();
    return `[${i + 1}] ${s.title}\n    Source: ${host}\n    ${s.snippet}`;
  }).join("\n\n");
}

// ── AI Providers ──────────────────────────────────────────────────────────────
async function callOAI(
  url: string, key: string, model: string, messages: ChatMessage[],
  maxTokens: number, requestId: string, providerName: string,
  extraHeaders?: Record<string, string>,
): Promise<AIResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(extraHeaders ?? {}) },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("warn", `${providerName}.http_error`, { requestId, status: res.status, err: err.slice(0, 200) });
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

async function callCloudflare(
  token: string, accountId: string, model: string, messages: ChatMessage[],
  maxTokens: number, requestId: string,
): Promise<AIResult> {
  const url = `${CF_BASE}/${accountId}/ai/run/${model}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages, max_tokens: maxTokens }),
      signal: AbortSignal.timeout(28_000),
    });
    if (!res.ok) return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: `HTTP ${res.status}` };
    const data = (await res.json()) as { success?: boolean; result?: { response?: string }; errors?: { message?: string }[] };
    if (!data.success) return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: data.errors?.map((e) => e.message).join("; ") ?? "unknown" };
    return { ok: true, content: data.result?.response ?? "", inputTokens: 0, outputTokens: 0, provider: "cloudflare", model };
  } catch (err) { return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: String(err) }; }
}

async function callGroqVision(
  imageUrl: string, captionText: string, allMessages: IncomingMessage[],
  groqKey: string, requestId: string,
): Promise<AIResult> {
  const prior = allMessages.slice(0, -1).filter((m) => ["user", "assistant"].includes(m.role)).map((m) => ({ role: m.role, content: getTextContent(m.content) }));
  const userContent: ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] = [];
  if (captionText) userContent.push({ type: "text", text: captionText });
  userContent.push({ type: "image_url", image_url: { url: imageUrl } });
  const systemContent = captionText
    ? "You are an advanced AI assistant with vision. Analyze the image and fulfill the user's request directly and thoroughly."
    : "You are an advanced AI assistant with vision. Analyze this image thoroughly: describe objects, people, text, colors, composition, and mood. Then ask what the user wants.";
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "meta-llama/llama-4-scout-17b-16e-instruct", messages: [{ role: "system", content: systemContent }, ...prior, { role: "user", content: userContent }], max_tokens: 1024 }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return { ok: false, content: "", inputTokens: 0, outputTokens: 0 };
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return { ok: true, content: data.choices?.[0]?.message?.content ?? "", inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0, provider: "groq-vision", model: "llama-4-scout" };
  } catch { return { ok: false, content: "", inputTokens: 0, outputTokens: 0 }; }
}

// ── Provider chain — OpenAI GPT-4o first, then Groq, Cerebras, Cloudflare ────
async function callWithFallback(
  messages: ChatMessage[],
  keys: { openai?: string; groq?: string; cerebras?: string; cloudflare?: string; cloudflareAccountId?: string },
  maxTokens: number,
  requestId: string,
): Promise<AIResult> {
  // 1. OpenAI GPT-4o (most powerful)
  if (keys.openai) {
    const r = await callOAI(OPENAI_URL, keys.openai, "gpt-4o", messages, maxTokens, requestId, "openai");
    if (r.ok) return r;
    // 2. GPT-4o-mini (faster fallback)
    const r2 = await callOAI(OPENAI_URL, keys.openai, "gpt-4o-mini", messages, maxTokens, requestId, "openai-mini");
    if (r2.ok) return r2;
  }
  // 3. Groq Llama-3.3-70B (fast & capable)
  if (keys.groq) {
    const r = await callOAI(GROQ_URL, keys.groq, "llama-3.3-70b-versatile", messages, maxTokens, requestId, "groq");
    if (r.ok) return r;
  }
  // 4. Groq Llama-3.1-8B (fast lite)
  if (keys.groq) {
    const r = await callOAI(GROQ_URL, keys.groq, "llama-3.1-8b-instant", messages, maxTokens, requestId, "groq-lite");
    if (r.ok) return r;
  }
  // 5. Cerebras GPT-OSS-120B
  if (keys.cerebras) {
    const r = await callOAI(CEREBRAS_URL, keys.cerebras, "gpt-oss-120b", messages, maxTokens, requestId, "cerebras");
    if (r.ok) return r;
  }
  // 6. Cloudflare Llama
  if (keys.cloudflare && keys.cloudflareAccountId) {
    const r = await callCloudflare(keys.cloudflare, keys.cloudflareAccountId, "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages, maxTokens, requestId);
    if (r.ok) return r;
  }
  return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: "all providers failed" };
}

// ── Agent tool execution ──────────────────────────────────────────────────────
async function executeTool(
  call: ToolCall,
  db: ReturnType<typeof createClient>,
  userId: string | undefined,
  requestId: string,
): Promise<ToolResult> {
  const { name, args } = call;

  if (name === "calculator") {
    const expr = String(args.expression ?? "").trim();
    const result = evalMath(expr);
    return result !== null
      ? { name, output: `${expr} = ${result}` }
      : { name, output: "Could not evaluate that expression. Please check the syntax.", error: true };
  }

  if (name === "code") {
    const lang = String(args.language ?? "python").toLowerCase();
    const code = String(args.code ?? "");
    if (!code.trim()) return { name, output: "No code provided.", error: true };
    return await executeCode(lang, code, requestId);
  }

  if (name === "search_docs") {
    if (!userId) return { name, output: "Document search requires authentication.", error: true };
    const query = String(args.query ?? "").trim();
    const docCtx = await searchDocuments(db, userId, query);
    return { name, output: docCtx || "No relevant content found in your documents." };
  }

  return { name, output: `Unknown tool: ${name}`, error: true };
}

// ── Agent loop — multi-step tool calling ──────────────────────────────────────
async function agentLoop(
  messages: ChatMessage[],
  keys: Parameters<typeof callWithFallback>[1],
  db: ReturnType<typeof createClient>,
  userId: string | undefined,
  maxTokens: number,
  requestId: string,
): Promise<{ result: AIResult; toolsUsed: ToolResult[]; finalMessages: ChatMessage[] }> {
  const workingMessages = [...messages];
  const toolsUsed: ToolResult[] = [];
  let lastResult: AIResult = { ok: false, content: "", inputTokens: 0, outputTokens: 0 };

  for (let iter = 0; iter < AGENT_MAX_ITER; iter++) {
    const result = await callWithFallback(workingMessages, keys, maxTokens, requestId);
    if (!result.ok) { lastResult = result; break; }

    const toolCalls = parseToolCalls(result.content);
    if (toolCalls.length === 0) { lastResult = result; break; }

    // Execute all tool calls
    const results = await Promise.all(toolCalls.map((tc) => executeTool(tc, db, userId, requestId)));
    toolsUsed.push(...results);

    // Append assistant message and tool results to conversation
    workingMessages.push({ role: "assistant", content: result.content });
    const toolResultText = results
      .map((r) => `${TOOL_RESULT_TAG}{"name":"${r.name}","output":${JSON.stringify(r.output)}}` + "</tool_result>")
      .join("\n");
    workingMessages.push({ role: "user", content: `Tool results:\n${toolResultText}\n\nPlease continue your response using these results.` });
    lastResult = result;
  }

  // Clean tool call markers from final response
  if (lastResult.ok) {
    lastResult = { ...lastResult, content: stripToolCalls(lastResult.content) };
  }

  return { result: lastResult, toolsUsed, finalMessages: workingMessages };
}

// ── Auth ──────────────────────────────────────────────────────────────────────
type AuthResult =
  | { type: "api_key"; userId?: string; apiKeyId: number }
  | { type: "user"; userId: string }
  | { type: "guest"; guestSessionId: string }
  | { type: "invalid_key"; reason: "not_found" | "revoked" | "lookup_error" }
  | { type: "none" };

async function resolveAuth(req: Request, db: ReturnType<typeof createClient>, requestId: string): Promise<AuthResult> {
  const dedicated = req.headers.get("x-engagera-api-key");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : undefined;
  const rawApiKey = dedicated?.startsWith("eng_") ? dedicated : bearerToken?.startsWith("eng_") ? bearerToken : undefined;

  if (rawApiKey) {
    const keyHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawApiKey)))).map((b) => b.toString(16).padStart(2, "0")).join("");
    const { data: keyRow, error: keyErr } = await db.from("engagera_api_keys").select("id, user_id, is_active").eq("key_hash", keyHash).single();
    if (keyErr) return { type: "invalid_key", reason: keyErr.code === "PGRST116" ? "not_found" : "lookup_error" };
    if (keyRow?.is_active) return { type: "api_key", userId: keyRow.user_id, apiKeyId: keyRow.id };
    return { type: "invalid_key", reason: "revoked" };
  }
  if (bearerToken) {
    const { data } = await db.auth.getUser(bearerToken);
    if (data.user) return { type: "user", userId: data.user.id };
  }
  const guestId = req.headers.get("x-guest-session-id")?.trim();
  if (guestId) return { type: "guest", guestSessionId: guestId };
  return { type: "none" };
}

async function checkGuestLimit(db: ReturnType<typeof createClient>, guestSessionId: string): Promise<{ allowed: boolean; count: number }> {
  const windowStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.from("engagera_guest_sessions").select("message_count, window_start").eq("session_id", guestSessionId).single();
  if (error || !data) return { allowed: true, count: 0 };
  if (data.window_start < windowStart) return { allowed: true, count: 0 };
  return { allowed: data.message_count < GUEST_LIMIT, count: data.message_count };
}

async function incrementGuestCount(db: ReturnType<typeof createClient>, guestSessionId: string): Promise<number> {
  try {
    const { data } = await db.rpc("engagera_increment_guest_count", { p_session_id: guestSessionId });
    return typeof data === "number" ? data : 0;
  } catch { return 0; }
}

async function persistConversation(
  db: ReturnType<typeof createClient>, authResult: AuthResult, userText: string,
  aiResult: AIResult, model: string, conversationId: string | undefined,
  hadSearch: boolean, requestId: string,
): Promise<number | null> {
  const convId: number | null = conversationId ? Number(conversationId) : null;
  if (authResult.type === "api_key") {
    try {
      await db.from("engagera_usage_records").insert({ api_key_id: authResult.apiKeyId, user_id: authResult.userId, model: aiResult.model ?? model, input_tokens: aiResult.inputTokens, output_tokens: aiResult.outputTokens, total_tokens: aiResult.inputTokens + aiResult.outputTokens });
    } catch { /* non-fatal */ }
    try {
      await db.rpc("engagera_increment_api_key_usage", { p_key_id: authResult.apiKeyId, p_tokens: aiResult.inputTokens + aiResult.outputTokens });
    } catch {
      try { await db.from("engagera_api_keys").update({ last_used_at: new Date().toISOString() }).eq("id", authResult.apiKeyId); } catch { /* non-fatal */ }
    }
    return null;
  }
  if (authResult.type !== "user") return convId;
  const userId = authResult.userId;
  let userConvId = convId;
  try {
    if (!userConvId) {
      const title = userText.slice(0, 60) || "New conversation";
      const { data: newConv } = await db.from("engagera_conversations").insert({ user_id: userId, title, model }).select("id").single();
      userConvId = newConv?.id ?? null;
    }
    if (userConvId) {
      await db.from("engagera_messages").insert([
        { conversation_id: userConvId, role: "user", content: userText, token_count: 0 },
        { conversation_id: userConvId, role: "assistant", content: aiResult.content, token_count: aiResult.outputTokens, metadata: hadSearch ? { search: true } : null },
      ]);
    }
  } catch (e) { log("warn", "handler.persist_failed", { requestId, error: String(e) }); }
  try {
    await db.from("engagera_usage_records").insert({ user_id: userId, model: aiResult.model ?? model, input_tokens: aiResult.inputTokens, output_tokens: aiResult.outputTokens, total_tokens: aiResult.inputTokens + aiResult.outputTokens });
  } catch { /* non-fatal */ }
  return userConvId;
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
    if (!supabaseUrl || !serviceKey) return json({ error: "Server misconfiguration" }, 500);

    const keys = {
      openai:              Deno.env.get("OPENAI_API_KEY")       || undefined,
      groq:                Deno.env.get("GROQ_API_KEY")         || undefined,
      cerebras:            Deno.env.get("CEREBRAS_API_KEY")      || undefined,
      cloudflare:          Deno.env.get("CLOUDFLARE_API_TOKEN")  || undefined,
      cloudflareAccountId: Deno.env.get("CLOUDFLARE_ACCOUNT_ID") || undefined,
    };

    const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    let body: { messages?: unknown[]; model?: string; conversationId?: string; stream?: boolean; contextHint?: string; userLocation?: string; };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

    const { messages: rawMessages = [], model = "engagera-pro", conversationId, stream: wantsStream = true, contextHint, userLocation } = body;

    if (!Array.isArray(rawMessages) || rawMessages.length === 0) return json({ error: "messages array is required" }, 400);

    const incomingMessages = rawMessages.filter((m): m is IncomingMessage => {
      if (!m || typeof m !== "object") return false;
      const msg = m as Record<string, unknown>;
      return ["user", "assistant", "system"].includes(msg.role as string) && (typeof msg.content === "string" || Array.isArray(msg.content));
    });
    if (incomingMessages.length === 0) return json({ error: "No valid messages" }, 400);

    const authResult = await resolveAuth(req, db, requestId);

    if (authResult.type === "guest") {
      const { allowed, count } = await checkGuestLimit(db, authResult.guestSessionId);
      if (!allowed) return json({ error: "Guest message limit reached. Sign in for unlimited access.", guestMessageCount: count, guestMessageLimit: GUEST_LIMIT }, 429);
    }
    if (authResult.type === "invalid_key") {
      return json({ error: authResult.reason === "revoked" ? "API key revoked — generate a new one in the Dashboard." : "Invalid API key.", code: "invalid_api_key" }, 401);
    }
    if (authResult.type === "none") return json({ error: "Authentication required" }, 401);

    const userId = authResult.type === "user" ? authResult.userId : (authResult.type === "api_key" ? authResult.userId : undefined);

    // ── Load user settings + memories in parallel ─────────────────────────────
    const [userSettings, memories] = await Promise.all([
      userId ? loadUserSettings(db, userId) : Promise.resolve({} as UserSettings),
      userId ? loadMemories(db, userId) : Promise.resolve([] as Memory[]),
    ]);

    const lastUserMsg = incomingMessages.filter((m) => m.role === "user").at(-1);
    const userText    = lastUserMsg ? getTextContent(lastUserMsg.content) : "";

    const isDevMode = model === "engagera-code" || contextHint?.toLowerCase().includes("dev") ||
      (incomingMessages[0]?.role === "system" && getTextContent(incomingMessages[0].content).toLowerCase().includes("dev"));

    const hasUploadedImage = hasImageAttachment(incomingMessages);
    const uploadedImageUrl = hasUploadedImage ? extractLastImageUrl(incomingMessages) : null;
    const imageCaption     = hasUploadedImage ? userText.trim() : "";
    const imageIntent      = hasUploadedImage ? detectImageIntent(imageCaption) : ("none" as ImageIntent);

    const isCompleteImage  = !hasUploadedImage && (isCompleteImageRequest(userText) || looksLikeImageIntent(userText));
    const isAnyImageIntent = isCompleteImage || hasUploadedImage;
    const shouldSearch     = !isAnyImageIntent && userText.length > 3 && needsWebSearch(userText);
    const shouldSearchDocs = userId && !isAnyImageIntent && (isKnowledgeBaseQuery(userText) || Boolean(userSettings.agentModeEnabled));

    if (isCompleteImage && authResult.type === "guest") {
      return json({ error: "Sign in to generate images.", requiresAuth: true, feature: "image_generation" }, 401);
    }

    const userUrls       = extractUrls(userText);
    const _weatherLoc    = extractWeatherLocation(userText);
    const weatherLocation = _weatherLoc ?? (
      /\b(weather|temperature|forecast|rain|snow|sunny|cloudy|humid|hot|cold|wind|storm)\b/i.test(userText) && userLocation ? userLocation : null
    );
    const _timeLoc    = extractTimeLocation(userText);
    const timeLocation = _timeLoc === null ? null : (_timeLoc === "UTC" && userLocation) ? userLocation : _timeLoc;

    // ── Build messages helper ─────────────────────────────────────────────────
    function buildMessages(searchCtx: string, urlCtx: string, weatherCtx: string, docCtx: string): ChatMessage[] {
      const nonSystemMsgs = toChat(incomingMessages.filter((m) => m.role !== "system"));
      if (authResult.type === "api_key") {
        const devSystem = incomingMessages.find((m) => m.role === "system");
        let sysContent = devSystem ? getTextContent(devSystem.content) : "";
        const liveCtx = [urlCtx && `Page content:\n${urlCtx}`, searchCtx && `Web search results:\n${searchCtx}`, weatherCtx && `Weather:\n${weatherCtx}`].filter(Boolean).join("\n\n");
        if (liveCtx) sysContent += (sysContent ? "\n\n" : "") + liveCtx;
        return sysContent ? [{ role: "system", content: sysContent }, ...nonSystemMsgs] : nonSystemMsgs;
      }
      const hint = typeof contextHint === "string" ? contextHint : "";
      let systemPrompt = buildSystemPrompt({
        mode: isDevMode ? "dev" : "default",
        searchContext: searchCtx,
        urlContext: urlCtx,
        weatherContext: weatherCtx,
        memories,
        customSystemPrompt: userSettings.customSystemPrompt,
        docContext: docCtx,
        agentModeEnabled: userSettings.agentModeEnabled,
      });
      if (hint) systemPrompt += `\n\nContext: ${hint}`;
      return [{ role: "system", content: systemPrompt }, ...nonSystemMsgs];
    }

    const enc = new TextEncoder();

    // ── SSE streaming path ────────────────────────────────────────────────────
    if (wantsStream) {
      // Uploaded image path
      if (hasUploadedImage && uploadedImageUrl) {
        const returnImageJson = async (content: string, mdl: string) => {
          const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0 };
          const convId = await persistConversation(db, authResult, imageCaption || "[image]", fakeResult, model, conversationId, false, requestId);
          let ngc: number | undefined;
          if (authResult.type === "guest") ngc = await incrementGuestCount(db, authResult.guestSessionId);
          return json({ id: requestId, model: mdl, message: { role: "assistant", content }, conversationId: convId, ...(ngc !== undefined && { guestMessageCount: ngc, guestMessageLimit: GUEST_LIMIT }) });
        };
        const returnTextSse = async (content: string, mdl: string) => {
          const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0, provider: "groq-vision", model: mdl };
          const convId = await persistConversation(db, authResult, imageCaption || "[image]", fakeResult, model, conversationId, false, requestId);
          let ngc: number | undefined;
          if (authResult.type === "guest") ngc = await incrementGuestCount(db, authResult.guestSessionId);
          const sseStream = new ReadableStream({ start(ctrl) {
            const enq = (f: string) => ctrl.enqueue(enc.encode(f));
            enq(sseFrame({ type: "token", content }));
            enq(sseFrame({ type: "done", model: mdl, conversationId: convId, ...(ngc !== undefined && { guestMessageCount: ngc, guestMessageLimit: GUEST_LIMIT }) }));
            enq("data: [DONE]\n\n"); ctrl.close();
          }});
          return new Response(sseStream, { status: 200, headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
        };
        if (imageIntent === "edit" && keys.cloudflare && keys.cloudflareAccountId) {
          const edited = await editImageCF(uploadedImageUrl, imageCaption, keys.cloudflare, keys.cloudflareAccountId, requestId);
          if (edited) return returnImageJson(edited, "stable-diffusion-v1-5-img2img");
        }
        if (keys.groq) {
          const visionResult = await callGroqVision(uploadedImageUrl, imageCaption, incomingMessages, keys.groq, requestId);
          if (visionResult.ok && visionResult.content) return returnTextSse(visionResult.content, "llama-4-scout");
        }
        return returnTextSse("I wasn't able to process your image right now. Please try again.", model);
      }

      // Text-based image gen
      if (isCompleteImage) {
        if (keys.cloudflare && keys.cloudflareAccountId) {
          const imageMarkdown = await generateImageCF(userText, keys.cloudflare, keys.cloudflareAccountId, requestId);
          if (imageMarkdown) {
            const fakeResult: AIResult = { ok: true, content: imageMarkdown, inputTokens: 0, outputTokens: 0, provider: "cloudflare-flux", model: "flux-1-schnell" };
            const convId = await persistConversation(db, authResult, userText, fakeResult, model, conversationId, false, requestId);
            let newGuestCount: number | undefined;
            if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);
            return json({ id: requestId, model: "flux-1-schnell", message: { role: "assistant", content: imageMarkdown }, conversationId: convId, ...(newGuestCount !== undefined && { guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT }) });
          }
          const errResult: AIResult = { ok: true, content: "I wasn't able to generate that image right now. Please try again in a moment.", inputTokens: 0, outputTokens: 0 };
          await persistConversation(db, authResult, userText, errResult, model, conversationId, false, requestId);
          return json({ id: requestId, model, message: { role: "assistant", content: errResult.content }, conversationId: conversationId ? Number(conversationId) : null });
        }
      }

      // Standard text path with all features
      const sseStream = new ReadableStream({
        async start(ctrl) {
          const enq = (frame: string) => ctrl.enqueue(enc.encode(frame));
          try {
            let searchSources: SearchSource[] = [];
            let urlCtx = "", weatherInfo: WeatherInfo | undefined, timeInfo: TimeInfo | undefined, weatherCtx = "", docCtx = "";

            const pendingCharsRef = { current: "" };
            let streamClosed = false;
            let revealRaf: number | null = null;

            const parallelTasks: Promise<void>[] = [];

            if (userUrls.length > 0) {
              enq(sseFrame({ type: "searchStatus", message: "Reading page content…" }));
              parallelTasks.push((async () => {
                const contents = await Promise.all(userUrls.map((u) => fetchPageContent(u, requestId)));
                const valid = contents.filter(Boolean) as string[];
                if (valid.length > 0) urlCtx = valid.join("\n\n---\n\n").slice(0, 8000);
              })());
            }
            if (weatherLocation) {
              const weatherPreferredLabel = _weatherLoc === null ? userLocation : undefined;
              parallelTasks.push((async () => {
                weatherInfo = await fetchWeather(weatherLocation, requestId, weatherPreferredLabel) ?? undefined;
                if (weatherInfo) weatherCtx = `Location: ${weatherInfo.label}, Temp: ${weatherInfo.tempC}°C (feels like ${weatherInfo.feelsLikeC}°C), Condition: ${weatherInfo.condition}, Humidity: ${weatherInfo.humidity}%, Wind: ${weatherInfo.windKph} km/h`;
              })());
            }
            if (timeLocation) {
              parallelTasks.push((async () => { timeInfo = await fetchTimeInfo(timeLocation, requestId) ?? undefined; })());
            }
            if (shouldSearch) {
              enq(sseFrame({ type: "searchStatus", message: "Searching the web…" }));
              parallelTasks.push((async () => {
                const rawSources = await webSearch(userText, requestId);
                if (rawSources.length > 0) {
                  enq(sseFrame({ type: "searchStatus", message: "Reading sources…" }));
                  searchSources = await enrichWithImages(rawSources, 4);
                  enq(sseFrame({ type: "meta", searchInfo: { query: userText, sources: searchSources } }));
                }
              })());
            }
            if (shouldSearchDocs && userId) {
              parallelTasks.push((async () => {
                docCtx = await searchDocuments(db, userId, userText);
              })());
            }

            await Promise.all(parallelTasks);

            const searchCtx = formatSearchContext(searchSources);
            const builtMessages = buildMessages(searchCtx, urlCtx, weatherCtx, docCtx);

            let aiResult: AIResult;

            // Agent mode: run tool loop, then stream final answer
            if (userSettings.agentModeEnabled && authResult.type === "user") {
              enq(sseFrame({ type: "searchStatus", message: "Thinking with tools…" }));
              const { result, toolsUsed } = await agentLoop(builtMessages, keys, db, userId, 2048, requestId);
              aiResult = result;
              if (toolsUsed.length > 0) {
                enq(sseFrame({ type: "searchStatus", message: `Used ${toolsUsed.map(t => t.name).join(", ")}…` }));
              }
            } else {
              aiResult = await callWithFallback(builtMessages, keys, 2048, requestId);
            }

            if (!aiResult.ok) {
              enq(sseFrame({ type: "error", error: "AI service temporarily unavailable. Please try again." }));
              enq("data: [DONE]\n\n"); ctrl.close(); return;
            }

            enq(sseFrame({ type: "token", content: aiResult.content }));

            const convId = await persistConversation(db, authResult, userText, aiResult, model, conversationId, searchSources.length > 0, requestId);
            let newGuestCount: number | undefined;
            if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);

            const latencyMs = Date.now() - startTime;
            log("info", "handler.success", { requestId, provider: aiResult.provider, model: aiResult.model, latencyMs });

            enq(sseFrame({
              type: "done",
              model: aiResult.model ?? model,
              conversationId: convId,
              ...(searchSources.length > 0 && { crawledSources: searchSources }),
              ...(weatherInfo && { weatherInfo }),
              ...(timeInfo && { timeInfo }),
              ...(newGuestCount !== undefined && { guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT }),
            }));
            enq("data: [DONE]\n\n");
            ctrl.close();

            // Fire-and-forget: extract and save memories from this exchange
            if (userId && aiResult.ok && aiResult.content && keys.groq) {
              extractAndSaveMemories(db, userId, userText, aiResult.content, keys.groq).catch(() => {});
            }

          } catch (err) {
            log("error", "stream.error", { requestId, error: String(err) });
            try { enq(sseFrame({ type: "error", error: "Internal server error" })); enq("data: [DONE]\n\n"); ctrl.close(); } catch { /* already closed */ }
          }
        },
      });

      return new Response(sseStream, { status: 200, headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
    }

    // ── JSON fallback path ────────────────────────────────────────────────────
    if (hasUploadedImage && uploadedImageUrl) {
      const persistAndReturn = async (content: string, mdl: string) => {
        const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0 };
        const convId = await persistConversation(db, authResult, imageCaption || "[image]", fakeResult, model, conversationId, false, requestId);
        let ngc: number | undefined;
        if (authResult.type === "guest") ngc = await incrementGuestCount(db, authResult.guestSessionId);
        return json({ id: requestId, model: mdl, message: { role: "assistant", content }, conversationId: convId, ...(ngc !== undefined && { guestMessageCount: ngc, guestMessageLimit: GUEST_LIMIT }) });
      };
      if (imageIntent === "edit" && keys.cloudflare && keys.cloudflareAccountId) {
        const edited = await editImageCF(uploadedImageUrl, imageCaption, keys.cloudflare, keys.cloudflareAccountId, requestId);
        if (edited) return persistAndReturn(edited, "stable-diffusion-v1-5-img2img");
      }
      if (keys.groq) {
        const visionResult = await callGroqVision(uploadedImageUrl, imageCaption, incomingMessages, keys.groq, requestId);
        if (visionResult.ok && visionResult.content) return persistAndReturn(visionResult.content, "llama-4-scout");
      }
      return persistAndReturn("I wasn't able to process your image right now. Please try again.", model);
    }

    if (isCompleteImage && keys.cloudflare && keys.cloudflareAccountId) {
      const imageMarkdown = await generateImageCF(userText, keys.cloudflare, keys.cloudflareAccountId, requestId);
      const content = imageMarkdown ?? "I wasn't able to generate that image right now. Please try again.";
      const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0 };
      const convId = await persistConversation(db, authResult, userText, fakeResult, model, conversationId, false, requestId);
      let newGuestCount: number | undefined;
      if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);
      return json({ id: requestId, model: "flux-1-schnell", message: { role: "assistant", content }, conversationId: convId, ...(newGuestCount !== undefined && { guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT }) });
    }

    const [searchSources, urlCtxRaw, weatherInfoRaw, docCtxRaw] = await Promise.all([
      shouldSearch ? webSearch(userText, requestId) : Promise.resolve([] as SearchSource[]),
      userUrls.length > 0 ? Promise.all(userUrls.map((u) => fetchPageContent(u, requestId))).then(c => (c.filter(Boolean) as string[]).join("\n\n---\n\n").slice(0, 8000)) : Promise.resolve(""),
      weatherLocation ? fetchWeather(weatherLocation, requestId) : Promise.resolve(null),
      shouldSearchDocs && userId ? searchDocuments(db, userId, userText) : Promise.resolve(""),
    ]);
    const weatherCtx = weatherInfoRaw ? `Location: ${weatherInfoRaw.label}, Temp: ${weatherInfoRaw.tempC}°C, Condition: ${weatherInfoRaw.condition}` : "";
    const [timeInfo, enrichedSources] = await Promise.all([
      timeLocation ? fetchTimeInfo(timeLocation, requestId) : Promise.resolve(null),
      searchSources.length > 0 ? enrichWithImages(searchSources, 3) : Promise.resolve(searchSources),
    ]);
    const searchCtx = formatSearchContext(enrichedSources);
    const builtMessages = buildMessages(searchCtx, urlCtxRaw, weatherCtx, docCtxRaw);
    const result = await callWithFallback(builtMessages, keys, 2048, requestId);
    if (!result.ok) return json({ error: "AI service temporarily unavailable. Please try again." }, 503);

    const convId = await persistConversation(db, authResult, userText, result, model, conversationId, enrichedSources.length > 0, requestId);
    let newGuestCount: number | undefined;
    if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);

    if (userId && result.ok && result.content && keys.groq) {
      extractAndSaveMemories(db, userId, userText, result.content, keys.groq).catch(() => {});
    }

    return json({
      id: requestId, model: result.model ?? model,
      message: { role: "assistant", content: result.content },
      conversationId: convId,
      ...(enrichedSources.length > 0 && { searchInfo: { sources: enrichedSources } }),
      ...(weatherInfoRaw && { weatherInfo: weatherInfoRaw }),
      ...(timeInfo && { timeInfo }),
      ...(newGuestCount !== undefined && { guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT }),
    });

  } catch (err) {
    log("error", "handler.fatal", { requestId, error: String(err) });
    return json({ error: "Internal server error" }, 500);
  }
});
