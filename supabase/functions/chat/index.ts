import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function — v12 (2026-07-17)
 *
 * New in v12:
 *  - Image generation via Cloudflare Flux (complete prompts only)
 *  - Incomplete image prompts → AI asks for a description (plain text)
 *  - URL content fetching: visits any URL the user shares and reads the page
 *  - Weather widget: Open-Meteo (free, no API key) + geocoding
 *  - Time widget: timezone from Open-Meteo geocoding
 *  - Honesty rules: AI admits "no data" instead of guessing
 *  - Concise, purposeful response guidance in system prompt
 *  - Better Google/DuckDuckGo scraping with business profile support
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
interface WeatherInfo {
  label: string;
  tempC: number;
  feelsLikeC: number;
  condition: string;
  icon: string;
  windKph: number;
  humidity: number;
  isDay: boolean;
}
interface TimeInfo {
  ianaZone: string;
  label: string;
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

// ── Uploaded-image helpers ────────────────────────────────────────────────────

/** Returns true when the latest user message contains an image_url content part. */
function hasImageAttachment(msgs: IncomingMessage[]): boolean {
  const last = msgs.filter((m) => m.role === "user").at(-1);
  if (!last || typeof last.content === "string") return false;
  return last.content.some((p) => p.type === "image_url");
}

/** Extracts the data-URL from the latest user message's image_url part, or null. */
function extractLastImageUrl(msgs: IncomingMessage[]): string | null {
  const last = msgs.filter((m) => m.role === "user").at(-1);
  if (!last || typeof last.content === "string") return null;
  const part = last.content.find(
    (p): p is { type: "image_url"; image_url: { url: string } } => p.type === "image_url",
  );
  return part?.image_url.url ?? null;
}

type ImageIntent = "edit" | "question" | "none";

/**
 * Classifies the user's caption:
 *   "edit"     — caption describes a transformation (add/remove/change/recolor…)
 *   "question" — caption asks something or requests analysis
 *   "none"     — no meaningful caption; AI should analyse and ask what they want
 */
function detectImageIntent(text: string): ImageIntent {
  const t = text.trim().toLowerCase();
  if (!t || t.length < 3) return "none";

  const editPatterns = [
    /\b(edit|modify|change|alter|adjust|fix|update)\b/,
    /\b(crop|resize|rotate|flip|mirror|stretch|scale)\b/,
    /\b(convert|transform|turn\s+(it\s+)?into)\b/,
    /\b(make\s+(it|this|the)\b)/,
    /\b(add|remove|delete|erase|replace|put|insert|apply)\b/,
    /\b(color|recolor|colorize|brighten|darken|lighten|saturate|desaturate)\b/,
    /\b(sharpen|blur|denoise|enhance|upscale|restore)\b/,
    /\b(background|foreground|filter|effect|style|artistic|cartoon|anime|sketch|oil\s+painting|watercolor)\b/,
    /\b(write|add\s+text|put\s+text|label)\b/,
    /\b(increase|decrease|boost)\b.*\b(contrast|brightness|exposure)\b/,
  ];

  const questionPatterns = [
    /^(what|who|how|where|when|why|is|are|does|can|could|do|should|would)\b/,
    /\b(tell\s+me|describe|explain|analyze|identify|read|translate|summarize)\b/,
    /\b(what('s|\s+is)\s+(in|this|that|the))\b/,
    /\b(what\s+do\s+you\s+see)\b/,
    /\?/,
  ];

  if (editPatterns.some((p) => p.test(t))) return "edit";
  if (questionPatterns.some((p) => p.test(t))) return "question";
  // Default: treat any caption as an analysis / fulfillment request
  return "question";
}

/** Decodes a data-URL string ("data:image/jpeg;base64,…") to a Uint8Array. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) throw new Error("Invalid data URL");
  const b64 = dataUrl.slice(commaIdx + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Calls Groq's llama-4-scout vision model to analyse an image.
 * Prior conversation messages are sent as text-only for context.
 */
async function callGroqVision(
  imageUrl: string,
  captionText: string,
  allMessages: IncomingMessage[],
  groqKey: string,
  requestId: string,
): Promise<AIResult> {
  // All messages except the current user turn (which contains the image)
  const prior = allMessages
    .slice(0, -1)
    .filter((m) => ["user", "assistant"].includes(m.role))
    .map((m) => ({ role: m.role, content: getTextContent(m.content) }));

  // Multimodal content for the current user turn
  const userContent: (
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  )[] = [];
  if (captionText) userContent.push({ type: "text", text: captionText });
  userContent.push({ type: "image_url", image_url: { url: imageUrl } });

  const systemContent = captionText
    ? "You are an advanced AI assistant with vision. Carefully analyze the attached image and fulfill the user's request directly, clearly, and thoroughly. If the request is ambiguous, ask one focused clarifying question."
    : "You are an advanced AI assistant with vision. The user has sent an image without a caption. Analyze it thoroughly: describe every meaningful element — objects, people, text, colors, composition, mood, and any notable details. After your analysis, ask the user what they would like you to do with this image.";

  const payload = {
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [
      { role: "system", content: systemContent },
      ...prior,
      { role: "user", content: userContent },
    ],
    max_tokens: 1024,
  };

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      log("warn", "vision.http_error", { requestId, status: res.status, err: err.slice(0, 200) });
      return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = data.choices?.[0]?.message?.content ?? "";
    const inputTokens = data.usage?.prompt_tokens ?? 0;
    const outputTokens = data.usage?.completion_tokens ?? 0;
    log("info", "vision.success", { requestId, inputTokens, outputTokens });
    return { ok: true, content, inputTokens, outputTokens, provider: "groq-vision", model: "llama-4-scout" };
  } catch (err) {
    log("warn", "vision.error", { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: String(err) };
  }
}

/**
 * Edits an image using Cloudflare's stable-diffusion-v1-5-img2img model.
 * Returns a markdown image string on success, null on failure.
 */
async function editImageCF(
  imageDataUrl: string,
  prompt: string,
  token: string,
  accountId: string,
  requestId: string,
): Promise<string | null> {
  const url = `${CF_BASE}/${accountId}/ai/run/@cf/runwayml/stable-diffusion-v1-5-img2img`;
  try {
    const bytes = dataUrlToBytes(imageDataUrl);
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        image: Array.from(bytes),
        num_steps: 20,
        strength: 0.75,
        guidance: 7.5,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log("warn", "img2img.http_error", { requestId, status: res.status, err: errText.slice(0, 200) });
      return null;
    }
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as { result?: { image?: string } };
      const b64 = data?.result?.image;
      if (!b64) return null;
      return `![Edited Image](data:image/png;base64,${b64})`;
    }
    const buf = await res.arrayBuffer();
    const imgBytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < imgBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...imgBytes.subarray(i, i + chunkSize));
    }
    const b64 = btoa(binary);
    log("info", "img2img.success", { requestId, bytes: imgBytes.length });
    return `![Edited Image](data:image/png;base64,${b64})`;
  } catch (err) {
    log("warn", "img2img.error", { requestId, error: String(err) });
    return null;
  }
}

// ── Image generation ──────────────────────────────────────────────────────────

// An image request is "complete" when there's a meaningful subject after the verb.
// "generate an image of a sunset" = complete ✓
// "generate an image of" = incomplete ✗
// "create a photo" = incomplete ✗
function isCompleteImageRequest(text: string): boolean {
  const t = text.trim();

  // Must be over 6 chars just to have enough words
  if (t.length < 6) return false;

  // Patterns that require a real subject (meaningful content after the trigger)
  const complete = [
    // "generate/create/make an image OF something" — most natural phrasing.
    // Allow an optional article (a/an/the) before the subject so that
    // "generate an image of a lion" correctly matches.
    /\b(generate|create|make|produce|build)\s+(a\s+|an\s+|the\s+|me\s+a\s+|me\s+an\s+)?(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render)\s+(of|showing|depicting|featuring|about)\s+(a\s+|an\s+|the\s+)?\w{3,}/i,
    // "generate/create/make/produce + ... + image-noun" with content in between
    /\b(generate|create|make|produce|build)\b.{3,}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic|portrait|scene|render|design)\b/i,
    // "draw/paint/sketch/illustrate/render me/a/an + ≥1 real word"
    /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|my\s+)?\w{3,}/i,
    // "show me a picture/image/photo of ..."
    /\bshow\s+me\s+(a|an|the)\s+(picture|image|photo|drawing|illustration)\s+of\s+\w{3,}/i,
    // "i want/need/would like a/an image/picture of ..."
    /\b(i\s+)?(want|need|would\s+like|give\s+me)\s+(a|an)\s+(image|picture|photo|drawing|illustration)\s+of\s+\w{3,}/i,
    // "generate a logo for X" / "design a poster about X"
    /\b(design|create|make|generate)\s+(a|an|the)\s+(logo|poster|banner|thumbnail|wallpaper)\s+(for|of|about|showing|with)\s+\w{3,}/i,
    // "image of a X", "picture of a X" as standalone phrases
    /\b(image|picture|photo|illustration|artwork)\s+of\s+(a\s+|an\s+|the\s+)?\w{3,}/i,
  ];

  return complete.some((p) => p.test(t));
}

// An image request is "incomplete" when the user typed just the trigger but no subject
function isIncompleteImagePrompt(text: string): boolean {
  const t = text.trim().toLowerCase();

  // Exact or near-exact incomplete phrases
  const incomplete = [
    /^(generate|create|make|produce)\s+(a|an|the)?\s*(image|picture|photo|drawing|painting|illustration|artwork)\s*(of\s*)?[.!?]*$/,
    /^(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a|an|the|something)?\s*[.!?]*$/,
    /^(show\s+me\s+)?(a|an)\s*(image|picture|photo)\s*(of\s*)?[.!?]*$/,
    /^(generate|create|make)\s+an?\s*(image|picture|photo|illustration|artwork)\s*[.!?]*$/,
  ];

  return incomplete.some((p) => p.test(t));
}

// Also matches the broader "this looks like image gen" heuristic (for routing)
function looksLikeImageIntent(text: string): boolean {
  const t = text.toLowerCase();
  const keywords = [
    "generate an image", "generate a image", "generate a picture", "generate a photo",
    "create an image", "create a image", "create a picture", "create a photo",
    "make an image", "make a image", "make me an image", "make me a picture",
    "draw me", "draw a ", "draw an ", "paint a ", "paint an ", "paint me",
    "sketch a ", "sketch an ", "sketch me", "illustrate this", "illustrate a",
    "render a ", "render an ", "render me", "design a logo", "design an image",
    "show me a picture", "show me an image", "show me a photo",
    "generate artwork", "create artwork", "make artwork",
  ];
  const patterns = [
    /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a\s+|an\s+|the\s+|some\s+|my\s+)?\w/i,
    /\b(generate|create|make|produce)\b.{0,50}\b(image|picture|photo|drawing|painting|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|graphic)\b/i,
  ];
  return keywords.some((k) => t.includes(k)) || patterns.some((p) => p.test(t));
}

// Cloudflare Flux image generation — returns a markdown image string or null
async function generateImageCF(
  prompt: string,
  token: string,
  accountId: string,
  requestId: string,
): Promise<string | null> {
  const url = `${CF_BASE}/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, num_steps: 4 }),
      signal: AbortSignal.timeout(50_000),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      log("warn", "image_gen.http_error", { requestId, status: res.status, err: errText.slice(0, 200) });
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";

    // Flux returns raw PNG bytes; some CF endpoints return JSON
    if (contentType.includes("application/json")) {
      const data = (await res.json()) as { result?: { image?: string } };
      const b64 = data?.result?.image;
      if (!b64) return null;
      return `![Generated Image](data:image/png;base64,${b64})`;
    }

    // Raw bytes — read and convert to base64 in chunks to avoid stack overflow
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const b64 = btoa(binary);
    log("info", "image_gen.success", { requestId, bytes: bytes.length });
    return `![Generated Image](data:image/png;base64,${b64})`;
  } catch (err) {
    log("warn", "image_gen.error", { requestId, error: String(err) });
    return null;
  }
}

// ── URL content fetching ──────────────────────────────────────────────────────

function extractUrls(text: string): string[] {
  const urlRe = /https?:\/\/[^\s<>"{}|\\^[\]`\u0000-\u001F]+/gi;
  const matches = [...text.matchAll(urlRe)].map((m) => m[0].replace(/[.,;:!?)]+$/, ""));
  // Deduplicate, max 3
  return [...new Set(matches)].slice(0, 3);
}

async function fetchPageContent(url: string, requestId: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    const html = await res.text();

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]{1,200})<\/title>/i);
    const pageTitle = titleMatch ? titleMatch[1].replace(/\s+/g, " ").trim() : "";

    // Strip scripts, styles, nav, footer, header noise
    const cleaned = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, " ")
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, " ")
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim();

    const body = cleaned.slice(0, 6000);
    const result = pageTitle ? `Page: ${pageTitle}\n\n${body}` : body;
    log("info", "url_fetch.success", { requestId, url: url.slice(0, 80), chars: result.length });
    return result;
  } catch (err) {
    log("warn", "url_fetch.error", { requestId, url: url.slice(0, 80), error: String(err) });
    return null;
  }
}

// ── Weather widget ────────────────────────────────────────────────────────────

function extractWeatherLocation(text: string): string | null {
  const t = text.toLowerCase().trim();
  if (!/\b(weather|temperature|forecast|rain|snow|sunny|cloudy|humid|hot|cold|wind|storm)\b/i.test(t)) return null;

  // Only match when a preposition clearly introduces a place name.
  // Deliberately omit greedy "weather <word>" patterns — they capture
  // non-place words like "like", "today", "outside", "conditions", etc.
  // and geocode them to random cities (the original source of the mismatch).
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
  } catch {
    return null;
  }
}

// WMO weather interpretation codes → human-readable condition + icon
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
    const data = (await res.json()) as {
      current?: {
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
        is_day?: number;
      };
    };
    const c = data.current;
    if (!c) return null;

    const isDay = (c.is_day ?? 1) === 1;
    const { condition, icon } = interpretWmo(c.weather_code ?? 0, isDay);

    // Use the client-supplied label when one is provided (device location
    // derived from timezone table) so the AI response always matches
    // the exact city name shown in the weather widget — the geocoding API
    // can return a country-level or differently-spelled name that would
    // mismatch what the widget displays.
    const label = preferredLabel ?? geo.name;

    log("info", "weather.success", { requestId, location, condition });
    return {
      label,
      tempC: Math.round(c.temperature_2m ?? 0),
      feelsLikeC: Math.round(c.apparent_temperature ?? 0),
      condition,
      icon,
      windKph: Math.round(c.wind_speed_10m ?? 0),
      humidity: Math.round(c.relative_humidity_2m ?? 0),
      isDay,
    };
  } catch (err) {
    log("warn", "weather.error", { requestId, location, error: String(err) });
    return null;
  }
}

// ── Time widget ───────────────────────────────────────────────────────────────

/**
 * Returns a location string when the user is asking about time, or null when
 * they're clearly not. When no location is specified we default to "UTC" so
 * the clock widget always renders — never return null just because the user
 * didn't say a city name.
 */
function extractTimeLocation(text: string): string | null {
  if (!/\b(time|what time|current time|clock|timezone|what's the time|whats the time)\b/i.test(text)) return null;

  // Explicit location: "time in Tokyo", "what time is it in Paris", "clock in Berlin"
  const loc =
    text.match(/\b(?:time\s+in|time\s+at|time\s+for|clock\s+in|what\s+time\s+is\s+it\s+in|what(?:'s|s)\s+the\s+time\s+in)\s+([A-Za-z\s,]+?)(?:\?|$|,|\.|!)/i) ||
    text.match(/\bin\s+([A-Za-z\s,]{3,30}?)(?:'s)?\s+(?:time|timezone)/i);

  // No location specified → default to UTC so the widget always shows
  return loc ? loc[1].trim() : "UTC";
}

async function fetchTimeInfo(location: string, requestId: string): Promise<TimeInfo | null> {
  // UTC needs no geocoding
  if (/^utc$/i.test(location.trim())) {
    log("info", "time.utc", { requestId });
    return { ianaZone: "UTC", label: "UTC" };
  }
  try {
    const geo = await geocode(location);
    if (!geo) {
      // Geocoding failed — still show UTC rather than nothing
      log("warn", "time.geocode_failed", { requestId, location });
      return { ianaZone: "UTC", label: `UTC (couldn't find "${location}")` };
    }
    log("info", "time.success", { requestId, location, zone: geo.ianaZone });
    return { ianaZone: geo.ianaZone, label: geo.name };
  } catch (err) {
    log("warn", "time.error", { requestId, location, error: String(err) });
    return { ianaZone: "UTC", label: "UTC" };
  }
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

// ── Cloudflare Workers AI (text) ──────────────────────────────────────────────
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
    const r = await callOAI(GROQ_URL, keys.groq, "llama-3.3-70b-versatile", messages, maxTokens, requestId, "groq");
    if (r.ok) return r;
  }
  if (keys.groq) {
    const r = await callOAI(GROQ_URL, keys.groq, "llama-3.1-8b-instant", messages, maxTokens, requestId, "groq-lite");
    if (r.ok) return r;
  }
  if (keys.cerebras) {
    const r = await callOAI(CEREBRAS_URL, keys.cerebras, "gpt-oss-120b", messages, maxTokens, requestId, "cerebras");
    if (r.ok) return r;
  }
  if (keys.cloudflare && keys.cloudflareAccountId) {
    const r = await callCloudflare(
      keys.cloudflare, keys.cloudflareAccountId,
      "@cf/meta/llama-3.3-70b-instruct-fp8-fast", messages, maxTokens, requestId,
    );
    if (r.ok) return r;
  }
  return { ok: false, content: "", inputTokens: 0, outputTokens: 0, error: "all providers failed" };
}

// ── Web search — DuckDuckGo with real URLs, titles, snippets ─────────────────
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

    const linkRe = /<a\s[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRe = /<a\s[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;

    const links: { url: string; title: string }[] = [];
    const snippets: string[] = [];
    let m: RegExpExecArray | null;

    while ((m = linkRe.exec(html)) !== null && links.length < 10) {
      let url = m[1];
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
      chunk.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      chunk.match(/<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
    const img = imgMatch?.[1]?.trim();
    return img?.startsWith("http") ? img : undefined;
  } catch {
    return undefined;
  }
}

async function enrichWithImages(sources: SearchSource[], maxEnrich = 4): Promise<SearchSource[]> {
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

  // Don't search for image generation — the backend handles that separately
  if (looksLikeImageIntent(text)) return false;

  // Pure time queries ("what is the time", "what time is it") are handled
  // by the time widget — no web search needed, and searching produces the
  // wrong behaviour (the AI cites time.is and asks for a timezone).
  if (/^\s*(what(?:'s|\s+is|\s+was)?\s+the\s+time|what\s+time\s+is\s+it|current\s+time|time\s+now|what\s+time\s+now)\s*[\?!.]?\s*$/i.test(text.trim())) return false;

  // Skip purely creative writing / math
  if (/^(write (me |a |an |the )?|compose |draft |create a (story|poem|essay|letter|email))/i.test(text.trim())) return false;
  if (/^(calculate|compute|solve for|what is \d[\d\s+\-*/^()]*[=?]|simplify|integrate|differentiate)/i.test(text.trim())) return false;

  const triggers = [
    "latest", "recent", "today", "tonight", "yesterday", "this week", "this year",
    "news", "current", "now", "live", "update", "breaking",
    "2023", "2024", "2025", "2026", "2027",
    "price", "cost", "how much", "worth", "value", "rate", "fee",
    "stock", "crypto", "bitcoin", "ethereum",
    "score", "result", "standings", "winner", "who won", "match", "game",
    "tournament", "championship", "election",
    "weather", "temperature", "forecast", "humidity",
    "where is", "where are", "location of",
    "who is", "who are", "ceo of", "founder of", "owner of",
    "what company", "which company",
    "release", "launch", "announce", "new model", "new version", "update",
    "specs", "review", "vs ", " vs", "versus", "compare", "comparison",
    "best ", "top ", "ranking", "trending", "popular",
    "buy", "purchase", "available", "in stock",
    "what is the ", "what are the ", "how many ", "how does ",
    "statistics", "data on", "report", "study", "research",
    "definition", "meaning of", "explain the",
    "how to ", "steps to ", "tutorial", "guide",
    // Business / local search
    "near me", "open now", "hours", "address", "phone number", "contact",
    "restaurant", "hotel", "store", "shop", "business", "company profile",
    "google business", "maps", "directions",
  ];

  return triggers.some((t) => lower.includes(t));
}

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(
  mode: "dev" | "default",
  searchContext: string,
  urlContext: string,
  weatherContext: string,
): string {
  const dateStr = new Date().toISOString().slice(0, 10);

  const sharedRules = `
Today's date is ${dateStr}.

Core rules — follow every one of these without exception:
- REAL-TIME ACCESS: You have live web search. Never claim you cannot check current events, prices, news, or recent data — you can and do. Never say "as of my last update" or "I don't have real-time data".
- HONESTY: If you genuinely have no data on something (e.g. no search results were found, the page couldn't be loaded), say so explicitly: "I don't have data on that right now" or "I couldn't find that." Never guess or hallucinate facts to fill a gap.
- CONCISE: Give the user exactly what they asked for — nothing more. Answer questions in 1–4 sentences for simple queries, with structure (bullets/headers) only when the answer genuinely benefits from it. Don't add filler, disclaimers, or suggestions the user didn't ask for.
- INTENT: Understand why the user is asking before answering. If they share a URL, they want to know about that page's content. If they ask a yes/no, give yes/no first then any needed context. If they ask for a list, give a list.
- URLS: NEVER include raw https:// URLs in your response text. Refer to sources by their domain/name only (e.g. "According to Reuters", "GitHub shows...", "The official Apple page states...").
- NO MARKERS: Never show [source], [1], [SEARCH], {{citation}}, or any implementation detail.
- CODE: Always use fenced code blocks with the correct language label.
- IMAGE PROMPTS: When the user asks you to generate an image, tell them it is being generated and describe what you are about to create. Never ask follow-up questions about an image request — generate immediately using whatever description they provided.
- TIME: When the user asks what time it is, a live clock widget is already displayed in the UI. Confirm it in one short sentence (e.g. "Here's the current UTC time." or "Here's the time in Tokyo."). NEVER ask the user what timezone they want — if they didn't specify one, UTC is already shown. NEVER search the web for the current time.
- WEATHER: When weather data is available, a weather widget is already displayed. Confirm the conditions briefly (e.g. "Here's the current weather in Lagos."). NEVER search the web for weather — the data is already fetched.
`.trim();

  let context = "";
  if (urlContext) context += `\n\nPage content retrieved from user's URL:\n${urlContext}`;
  if (searchContext) context += `\n\nLive web search results (use to inform your answer):\n${searchContext}`;
  if (weatherContext) context += `\n\nCurrent weather data (already shown in the UI widget — briefly confirm the conditions in your reply):\n${weatherContext}`;

  if (mode === "dev") {
    return `You are Engagera Dev — an expert software engineering assistant built by AfuAI (AfuChat Technologies Limited). You help developers build production-quality software.\n${sharedRules}${context}`;
  }

  return `You are Engagera — an advanced AI assistant built by AfuAI (AfuChat Technologies Limited). You are accurate, direct, and knowledgeable across all subjects.\n${sharedRules}${context}`;
}

function formatSearchContext(sources: SearchSource[]): string {
  return sources
    .slice(0, 5)
    .map((s, i) => {
      const host = (() => { try { return new URL(s.url).hostname.replace(/^www\./, ""); } catch { return s.url; } })();
      return `[${i + 1}] ${s.title}\n    Source: ${host}\n    ${s.snippet}`;
    })
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
      new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(apiKeyHeader))),
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
      contextHint?: string;
      userLocation?: string;
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
      contextHint,
      userLocation,
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

    if (incomingMessages.length === 0) return json({ error: "No valid messages" }, 400);

    const authResult = await resolveAuth(req, db, requestId);

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

    if (authResult.type === "none") return json({ error: "Authentication required" }, 401);

    const lastUserMsg = incomingMessages.filter((m) => m.role === "user").at(-1);
    const userText    = lastUserMsg ? getTextContent(lastUserMsg.content) : "";

    const isDevMode =
      model === "engagera-code" ||
      contextHint?.toLowerCase().includes("dev") ||
      (incomingMessages[0]?.role === "system" &&
        getTextContent(incomingMessages[0].content).toLowerCase().includes("dev"));

    // ── Detect uploaded image ─────────────────────────────────────────────────
    const hasUploadedImage = hasImageAttachment(incomingMessages);
    const uploadedImageUrl = hasUploadedImage ? extractLastImageUrl(incomingMessages) : null;
    const imageCaption     = hasUploadedImage ? userText.trim() : "";
    const imageIntent      = hasUploadedImage ? detectImageIntent(imageCaption) : ("none" as ImageIntent);

    // ── Classify the request ──────────────────────────────────────────────────
    // Any recognised image intent is treated as a complete request — we never
    // ask the user for more details before generating. If the prompt is vague,
    // Flux will generate something reasonable and the user can refine from there.
    const isCompleteImage   = !hasUploadedImage && (isCompleteImageRequest(userText) || looksLikeImageIntent(userText));
    const isAnyImageIntent  = isCompleteImage || hasUploadedImage;
    // Skip web search for both text-based image gen and uploaded-image requests
    const shouldSearch      = !isAnyImageIntent && userText.length > 3 && needsWebSearch(userText);

    // Text-based image generation (Flux) is only available to signed-in users.
    // Image analysis and editing via an attached image is available to all.
    if (isCompleteImage && authResult.type === "guest") {
      return json({
        error: "Sign in to generate images. Create a free account to unlock image generation.",
        requiresAuth: true,
        feature: "image_generation",
      }, 401);
    }

    // Detect URLs in the user message that should be read
    const userUrls = extractUrls(userText);

    // Detect weather / time requests.
    // When the user doesn't name a city, fall back to the location the client
    // derived from the device timezone — never to UTC or a geocoded garbage word.
    const _weatherLoc = extractWeatherLocation(userText);
    const weatherLocation = _weatherLoc ?? (
      /\b(weather|temperature|forecast|rain|snow|sunny|cloudy|humid|hot|cold|wind|storm)\b/i.test(userText) && userLocation
        ? userLocation
        : null
    );

    const _timeLoc = extractTimeLocation(userText);
    // extractTimeLocation returns "UTC" when no city was named — replace with
    // the user's real location so the clock widget shows their local time.
    const timeLocation = _timeLoc === null ? null
      : (_timeLoc === "UTC" && userLocation) ? userLocation
      : _timeLoc;

    // ── Builder helper ────────────────────────────────────────────────────────
    function buildMessages(searchCtx: string, urlCtx: string, weatherCtx: string): ChatMessage[] {
      const hint = typeof contextHint === "string" ? contextHint : "";
      let systemPrompt = buildSystemPrompt(isDevMode ? "dev" : "default", searchCtx, urlCtx, weatherCtx);
      if (hint) systemPrompt += `\n\nContext: ${hint}`;
      return [
        { role: "system", content: systemPrompt },
        ...toChat(incomingMessages.filter((m) => m.role !== "system")),
      ];
    }

    // ═══════════════════════════════════════════════════════════════════════
    // SSE streaming path
    // ═══════════════════════════════════════════════════════════════════════
    if (wantsStream) {
      const enc = new TextEncoder();

      // ── Uploaded image path (vision analysis / image editing) ─────────────
      if (hasUploadedImage && uploadedImageUrl) {
        // Helper: return a JSON image payload (large base64 always goes as JSON)
        const returnImageJson = async (content: string, mdl: string) => {
          const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0, provider: "cloudflare-img2img", model: mdl };
          const convId = await persistConversation(db, authResult, imageCaption || "[image]", fakeResult, model, conversationId, false, requestId);
          let ngc: number | undefined;
          if (authResult.type === "guest") ngc = await incrementGuestCount(db, authResult.guestSessionId);
          return json({ id: requestId, model: mdl, message: { role: "assistant", content }, conversationId: convId, ...(ngc !== undefined && { guestMessageCount: ngc, guestMessageLimit: GUEST_LIMIT }) });
        };

        // Helper: return a text response via SSE stream
        const returnTextSse = async (content: string, mdl: string) => {
          const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0, provider: "groq-vision", model: mdl };
          const convId = await persistConversation(db, authResult, imageCaption || "[image]", fakeResult, model, conversationId, false, requestId);
          let ngc: number | undefined;
          if (authResult.type === "guest") ngc = await incrementGuestCount(db, authResult.guestSessionId);
          const sseStream = new ReadableStream({
            start(ctrl) {
              const enq = (f: string) => ctrl.enqueue(enc.encode(f));
              enq(sseFrame({ type: "token", content }));
              enq(sseFrame({ type: "done", model: mdl, conversationId: convId, ...(ngc !== undefined && { guestMessageCount: ngc, guestMessageLimit: GUEST_LIMIT }) }));
              enq("data: [DONE]\n\n");
              ctrl.close();
            },
          });
          return new Response(sseStream, { status: 200, headers: { ...CORS, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no" } });
        };

        // Image editing: try img2img first
        if (imageIntent === "edit" && keys.cloudflare && keys.cloudflareAccountId) {
          log("info", "img2img.start", { requestId, prompt: imageCaption.slice(0, 80) });
          const edited = await editImageCF(uploadedImageUrl, imageCaption, keys.cloudflare, keys.cloudflareAccountId, requestId);
          if (edited) return returnImageJson(edited, "stable-diffusion-v1-5-img2img");
          // img2img failed — fall through to vision analysis as graceful degradation
          log("warn", "img2img.failed_fallback_to_vision", { requestId });
        }

        // Vision analysis (question, no-caption, or img2img fallback)
        if (keys.groq) {
          log("info", "vision.start", { requestId, intent: imageIntent, captionLen: imageCaption.length });
          const visionResult = await callGroqVision(uploadedImageUrl, imageCaption, incomingMessages, keys.groq, requestId);
          if (visionResult.ok && visionResult.content) {
            return returnTextSse(visionResult.content, "llama-4-scout");
          }
        }

        // Both vision and img2img unavailable — graceful error via SSE
        return returnTextSse("I wasn't able to process your image right now. Please try again in a moment.", model);
      }

      // ── Text-based image generation path ────────────────────────────────
      if (isCompleteImage) {
        if (!keys.cloudflare || !keys.cloudflareAccountId) {
          // No image gen credentials — fall through to text response
          log("warn", "image_gen.no_keys", { requestId });
        } else {
          log("info", "image_gen.start", { requestId, prompt: userText.slice(0, 80) });

          const imageMarkdown = await generateImageCF(userText, keys.cloudflare, keys.cloudflareAccountId, requestId);

          if (imageMarkdown) {
            const fakeResult: AIResult = {
              ok: true,
              content: imageMarkdown,
              inputTokens: 0,
              outputTokens: 0,
              provider: "cloudflare-flux",
              model: "flux-1-schnell",
            };

            const convId = await persistConversation(db, authResult, userText, fakeResult, model, conversationId, false, requestId);
            let newGuestCount: number | undefined;
            if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);

            // Image gen always returns JSON (not SSE) so the client can
            // handle the large base64 body as a single payload
            return json({
              id: requestId,
              model: "flux-1-schnell",
              message: { role: "assistant", content: imageMarkdown },
              conversationId: convId,
              ...(newGuestCount !== undefined && {
                guestMessageCount: newGuestCount,
                guestMessageLimit: GUEST_LIMIT,
              }),
            });
          }

          // Image gen failed — tell the user gracefully
          const errResult: AIResult = { ok: true, content: "I wasn't able to generate that image right now. Please try again in a moment.", inputTokens: 0, outputTokens: 0 };
          await persistConversation(db, authResult, userText, errResult, model, conversationId, false, requestId);
          return json({
            id: requestId,
            model,
            message: { role: "assistant", content: errResult.content },
            conversationId: conversationId ? Number(conversationId) : null,
          });
        }
      }


      // ── Standard text path (with optional search + URL fetch + weather/time) ─
      const sseStream = new ReadableStream({
        async start(ctrl) {
          const enq = (frame: string) => ctrl.enqueue(enc.encode(frame));

          try {
            let searchSources: SearchSource[] = [];
            let urlCtx = "";
            let weatherInfo: WeatherInfo | undefined;
            let timeInfo: TimeInfo | undefined;
            let weatherCtx = "";

            // ── Parallel: URL fetch + weather/time lookup ─────────────────
            const parallelTasks: Promise<void>[] = [];

            if (userUrls.length > 0) {
              enq(sseFrame({ type: "searchStatus", message: "Reading page content…" }));
              parallelTasks.push(
                (async () => {
                  const contents = await Promise.all(userUrls.map((u) => fetchPageContent(u, requestId)));
                  const valid = contents.filter(Boolean) as string[];
                  if (valid.length > 0) urlCtx = valid.join("\n\n---\n\n").slice(0, 8000);
                })(),
              );
            }

            if (weatherLocation) {
              // When we fell back to the device location (user didn't name a
              // city), pass the original client label so the AI and the widget
              // always agree on the city name — the geocoding API can return a
              // different (often country-level) spelling that mismatches the
              // widget's timezone-table label.
              const weatherPreferredLabel = _weatherLoc === null ? userLocation : undefined;
              parallelTasks.push(
                (async () => {
                  weatherInfo = await fetchWeather(weatherLocation, requestId, weatherPreferredLabel) ?? undefined;
                  if (weatherInfo) {
                    weatherCtx = `Location: ${weatherInfo.label}, Temp: ${weatherInfo.tempC}°C (feels like ${weatherInfo.feelsLikeC}°C), Condition: ${weatherInfo.condition}, Humidity: ${weatherInfo.humidity}%, Wind: ${weatherInfo.windKph} km/h`;
                  }
                })(),
              );
            }

            if (timeLocation) {
              parallelTasks.push(
                (async () => {
                  timeInfo = await fetchTimeInfo(timeLocation, requestId) ?? undefined;
                })(),
              );
            }

            if (shouldSearch) {
              enq(sseFrame({ type: "searchStatus", message: "Searching the web…" }));
              parallelTasks.push(
                (async () => {
                  const rawSources = await webSearch(userText, requestId);
                  if (rawSources.length > 0) {
                    enq(sseFrame({ type: "searchStatus", message: "Reading sources…" }));
                    searchSources = await enrichWithImages(rawSources, 4);
                    enq(sseFrame({ type: "meta", searchInfo: { query: userText, sources: searchSources } }));
                  }
                })(),
              );
            }

            // Run all parallel tasks (URL fetch, weather, time, search)
            await Promise.all(parallelTasks);

            // Build messages with all gathered context
            const searchCtx = formatSearchContext(searchSources);
            const aiResult = await callWithFallback(buildMessages(searchCtx, urlCtx, weatherCtx), keys, 2048, requestId);

            if (!aiResult.ok) {
              enq(sseFrame({ type: "error", error: "AI service temporarily unavailable. Please try again." }));
              enq("data: [DONE]\n\n");
              ctrl.close();
              return;
            }

            enq(sseFrame({ type: "token", content: aiResult.content }));

            const convId = await persistConversation(
              db, authResult, userText, aiResult, model,
              conversationId, searchSources.length > 0, requestId,
            );
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

    // ── Uploaded image path (JSON) ─────────────────────────────────────────
    if (hasUploadedImage && uploadedImageUrl) {
      const persistAndReturn = async (content: string, mdl: string) => {
        const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0 };
        const convId = await persistConversation(db, authResult, imageCaption || "[image]", fakeResult, model, conversationId, false, requestId);
        let ngc: number | undefined;
        if (authResult.type === "guest") ngc = await incrementGuestCount(db, authResult.guestSessionId);
        return json({ id: requestId, model: mdl, message: { role: "assistant", content }, conversationId: convId, ...(ngc !== undefined && { guestMessageCount: ngc, guestMessageLimit: GUEST_LIMIT }) });
      };

      if (imageIntent === "edit" && keys.cloudflare && keys.cloudflareAccountId) {
        log("info", "img2img.start.json", { requestId, prompt: imageCaption.slice(0, 80) });
        const edited = await editImageCF(uploadedImageUrl, imageCaption, keys.cloudflare, keys.cloudflareAccountId, requestId);
        if (edited) return persistAndReturn(edited, "stable-diffusion-v1-5-img2img");
      }

      if (keys.groq) {
        log("info", "vision.start.json", { requestId, intent: imageIntent });
        const visionResult = await callGroqVision(uploadedImageUrl, imageCaption, incomingMessages, keys.groq, requestId);
        if (visionResult.ok && visionResult.content) {
          return persistAndReturn(visionResult.content, "llama-4-scout");
        }
      }

      return persistAndReturn("I wasn't able to process your image right now. Please try again in a moment.", model);
    }

    // Image gen in non-streaming mode
    if (isCompleteImage && keys.cloudflare && keys.cloudflareAccountId) {
      const imageMarkdown = await generateImageCF(userText, keys.cloudflare, keys.cloudflareAccountId, requestId);
      const content = imageMarkdown ?? "I wasn't able to generate that image right now. Please try again.";
      const fakeResult: AIResult = { ok: true, content, inputTokens: 0, outputTokens: 0 };
      const convId = await persistConversation(db, authResult, userText, fakeResult, model, conversationId, false, requestId);
      let newGuestCount: number | undefined;
      if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);
      return json({
        id: requestId, model: "flux-1-schnell",
        message: { role: "assistant", content },
        conversationId: convId,
        ...(newGuestCount !== undefined && { guestMessageCount: newGuestCount, guestMessageLimit: GUEST_LIMIT }),
      });
    }


    // Standard text path
    let searchSources: SearchSource[] = [];
    let urlCtx = "";
    let weatherInfo: WeatherInfo | undefined;
    let timeInfo: TimeInfo | undefined;
    let weatherCtx = "";

    const tasks: Promise<void>[] = [];

    if (userUrls.length > 0) {
      tasks.push((async () => {
        const contents = await Promise.all(userUrls.map((u) => fetchPageContent(u, requestId)));
        urlCtx = (contents.filter(Boolean) as string[]).join("\n\n---\n\n").slice(0, 8000);
      })());
    }
    if (weatherLocation) {
      tasks.push((async () => {
        weatherInfo = await fetchWeather(weatherLocation, requestId) ?? undefined;
        if (weatherInfo) weatherCtx = `Location: ${weatherInfo.label}, Temp: ${weatherInfo.tempC}°C, Condition: ${weatherInfo.condition}`;
      })());
    }
    if (timeLocation) {
      tasks.push((async () => { timeInfo = await fetchTimeInfo(timeLocation, requestId) ?? undefined; })());
    }
    if (shouldSearch) {
      tasks.push((async () => {
        const raw = await webSearch(userText, requestId);
        if (raw.length > 0) {
          const [enriched] = await Promise.all([enrichWithImages(raw, 3)]);
          searchSources = enriched;
        }
      })());
    }

    await Promise.all(tasks);

    const searchCtx = formatSearchContext(searchSources);
    const result = await callWithFallback(buildMessages(searchCtx, urlCtx, weatherCtx), keys, 2048, requestId);
    if (!result.ok) return json({ error: "AI service temporarily unavailable. Please try again." }, 503);

    const convId = await persistConversation(
      db, authResult, userText, result, model, conversationId,
      searchSources.length > 0, requestId,
    );
    let newGuestCount: number | undefined;
    if (authResult.type === "guest") newGuestCount = await incrementGuestCount(db, authResult.guestSessionId);

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
      ...(searchSources.length > 0 && { searchInfo: { query: userText, sources: searchSources } }),
      ...(weatherInfo && { weatherInfo }),
      ...(timeInfo && { timeInfo }),
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
