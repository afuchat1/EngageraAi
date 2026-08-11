/**
 * Pollinations.AI Gateway — Engagera Edge Function v1
 *
 * POST /functions/v1/pollinations
 *   { type: "text",   model?, messages, stream? }            → SSE stream or JSON
 *   { type: "image",  prompt, model?, width?, height?, seed?, enhance? } → { url, … }
 *   { type: "audio",  text, voice? }                         → MP3 binary
 *   { type: "video",  prompt }                               → { url, … }
 *   { type: "models" }                                       → { text, image, voices }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-engagera-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GROQ_BASE  = "https://api.groq.com/openai/v1";
const IMAGE_BASE = "https://image.pollinations.ai";
const VIDEO_BASE = "https://video.pollinations.ai";

// Map Pollinations model aliases → Groq model IDs
const GROQ_MODEL: Record<string, string> = {
  "openai":           "llama-3.3-70b-versatile",
  "openai-large":     "llama-3.3-70b-versatile",
  "openai-reasoning": "deepseek-r1-distill-llama-70b",
  "claude":           "llama-3.3-70b-versatile",
  "claude-thinking":  "deepseek-r1-distill-llama-70b",
  "gemini":           "llama-3.1-8b-instant",
  "gemini-thinking":  "deepseek-r1-distill-llama-70b",
  "mistral":          "llama-3.3-70b-versatile",
  "llama":            "llama-3.3-70b-versatile",
  "qwen-coder":       "llama-3.3-70b-versatile",
  "deepseek":         "llama-3.3-70b-versatile",
};

const TEXT_MODELS = [
  { id: "openai",            name: "GPT-4o",              provider: "OpenAI",     category: "pro"    },
  { id: "openai-large",      name: "GPT-4o Latest",        provider: "OpenAI",     category: "pro"    },
  { id: "openai-reasoning",  name: "o4-mini",              provider: "OpenAI",     category: "reason" },
  { id: "claude",            name: "Claude Sonnet 3.7",    provider: "Anthropic",  category: "pro"    },
  { id: "claude-thinking",   name: "Claude + Thinking",    provider: "Anthropic",  category: "reason" },
  { id: "gemini",            name: "Gemini 2.0 Flash",     provider: "Google",     category: "lite"   },
  { id: "gemini-thinking",   name: "Gemini 2.0 Thinking",  provider: "Google",     category: "reason" },
  { id: "mistral",           name: "Mistral Large",        provider: "Mistral",    category: "pro"    },
  { id: "llama",             name: "Llama 3.3 70B",        provider: "Meta",       category: "lite"   },
  { id: "qwen-coder",        name: "Qwen 2.5 Coder 32B",   provider: "Alibaba",    category: "code"   },
  { id: "deepseek",          name: "DeepSeek-V3",          provider: "DeepSeek",   category: "pro"    },
];

const IMAGE_MODELS = [
  { id: "flux",          name: "Flux 1.1",        description: "Fast, high-quality" },
  { id: "flux-pro",      name: "Flux Pro",         description: "Premium quality"    },
  { id: "turbo",         name: "Turbo",            description: "Ultra-fast"          },
  { id: "flux-realism",  name: "Flux Realism",     description: "Photorealistic"     },
  { id: "flux-anime",    name: "Flux Anime",       description: "Anime & illustration"},
  { id: "flux-3d",       name: "Flux 3D",          description: "3D rendered"        },
  { id: "gptimage",      name: "GPT Image",        description: "DALL·E quality"     },
];

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];

function jsonRes(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

async function requireUser(req: Request): Promise<boolean> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return false;
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data } = await db.auth.getUser(authHeader.slice(7));
  return !!data.user;
}

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")   return jsonRes({ error: "Method not allowed" }, 405);
  if (!(await requireUser(req))) return jsonRes({ error: "Authentication required" }, 401);

  const groqKey = Deno.env.get("GROQ_API_KEY") ?? "";
  const polKey  = Deno.env.get("POLLINATIONS_API_KEY") ?? "";

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return jsonRes({ error: "Invalid JSON body" }, 400); }

  const { type, ...params } = body as { type: string; [k: string]: unknown };

  switch (type) {
    case "models": return jsonRes({ text: TEXT_MODELS, image: IMAGE_MODELS, voices: VOICES });
    case "text":   return handleText(params, groqKey);
    case "image":  return handleImage(params, polKey);
    case "audio":  return handleAudio(params, groqKey);
    case "video":  return handleVideo(params, polKey);
    default:
      return jsonRes({ error: `Unknown type "${type}". Use: text, image, audio, video, models` }, 400);
  }
});

// ── Text (via Groq) ───────────────────────────────────────────────────────────
async function handleText(params: Record<string, unknown>, groqKey: string): Promise<Response> {
  const messages = params.messages as Array<{ role: string; content: string }> | undefined;
  if (!messages?.length) return jsonRes({ error: "messages is required" }, 400);
  if (!groqKey) return jsonRes({ error: "Text generation not configured" }, 503);

  const polModel  = (params.model as string) || "openai";
  const groqModel = GROQ_MODEL[polModel] ?? "llama-3.3-70b-versatile";
  const stream    = params.stream === true;
  const maxTokens = (params.max_tokens as number) || 4096;
  const systemMsg = params.system as string | undefined;

  const allMessages = systemMsg
    ? [{ role: "system", content: systemMsg }, ...messages]
    : messages;

  const upRes = await fetch(`${GROQ_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: groqModel, messages: allMessages, stream, max_tokens: maxTokens }),
  });

  if (!upRes.ok) {
    const errText = await upRes.text().catch(() => "");
    console.error("Groq text error:", upRes.status, errText.slice(0, 300));
    return jsonRes({ error: `Text generation failed (${upRes.status})` }, 502);
  }

  if (stream && upRes.body) {
    return new Response(upRes.body, {
      headers: {
        ...CORS,
        "Content-Type":       "text/event-stream",
        "Cache-Control":      "no-cache",
        "X-Accel-Buffering":  "no",
      },
    });
  }

  return jsonRes(await upRes.json());
}

// ── Image ─────────────────────────────────────────────────────────────────────
async function handleImage(params: Record<string, unknown>, apiKey: string): Promise<Response> {
  const prompt = (params.prompt as string | undefined)?.trim();
  if (!prompt) return jsonRes({ error: "prompt is required" }, 400);

  const model     = (params.model  as string) || "flux";
  const width     = (params.width  as number) || 1024;
  const height    = (params.height as number) || 1024;
  const enhance   = params.enhance === true;
  const seed      = params.seed as number | undefined;
  const negPrompt = params.negative_prompt as string | undefined;

  const qs = new URLSearchParams({
    model,
    width:   String(width),
    height:  String(height),
    nologo:  "true",
    enhance: String(enhance),
    ...(apiKey ? { token: apiKey, private: "true" } : {}),
  });
  if (seed != null)      qs.set("seed",             String(seed));
  if (negPrompt?.trim()) qs.set("negative_prompt",  negPrompt.trim());

  const url = `${IMAGE_BASE}/prompt/${encodeURIComponent(prompt)}?${qs}`;
  return jsonRes({ url, prompt, model, width, height, seed });
}

// ── Audio TTS (via Groq) ──────────────────────────────────────────────────────
async function handleAudio(params: Record<string, unknown>, groqKey: string): Promise<Response> {
  const text = (params.text as string | undefined)?.trim();
  if (!text) return jsonRes({ error: "text is required" }, 400);
  if (!groqKey) return jsonRes({ error: "TTS not configured" }, 503);

  const voice = (params.voice as string) || "nova";

  const upRes = await fetch(`${GROQ_BASE}/audio/speech`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model:           "openai-audio",
      input:           text,
      voice,
      response_format: "mp3",
    }),
  });

  if (!upRes.ok) {
    const errText = await upRes.text().catch(() => "");
    console.error("Pollinations audio error:", upRes.status, errText.slice(0, 300));
    return jsonRes({ error: `Audio generation failed (${upRes.status})` }, 502);
  }

  const buf = await upRes.arrayBuffer();
  return new Response(buf, {
    headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

// ── Video ─────────────────────────────────────────────────────────────────────
async function handleVideo(params: Record<string, unknown>, apiKey: string): Promise<Response> {
  const prompt = (params.prompt as string | undefined)?.trim();
  if (!prompt) return jsonRes({ error: "prompt is required" }, 400);

  const upRes = await fetch(`${VIDEO_BASE}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });

  if (!upRes.ok) {
    const errText = await upRes.text().catch(() => "");
    console.error("Pollinations video error:", upRes.status, errText.slice(0, 300));
    return jsonRes({ error: `Video generation failed (${upRes.status})`, detail: errText.slice(0, 200) }, 502);
  }

  const ct = upRes.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) {
    return jsonRes(await upRes.json());
  }

  const raw = (await upRes.text()).trim();
  return jsonRes({ url: raw.startsWith("http") ? raw : null, raw, prompt });
}
