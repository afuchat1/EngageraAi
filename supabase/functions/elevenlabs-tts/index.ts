/**
 * Engagera TTS Edge Function — v2 (2026-07-22)
 *
 * Backed by OpenAI TTS with full voice + quality selection.
 *
 * Request: POST JSON { text: string, voice?: string, model?: string }
 *   voice: nova | alloy | echo | fable | onyx | shimmer (default: nova)
 *   model: tts-1 | tts-1-hd (default: tts-1-hd for highest quality)
 * Response: binary MP3 audio
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const VALID_VOICES = new Set(["nova", "alloy", "echo", "fable", "onyx", "shimmer"]);
const VALID_MODELS = new Set(["tts-1", "tts-1-hd"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let text = "", voice = "nova", model = "tts-1-hd";
  try {
    const body = await req.json() as { text?: string; voice?: string; voice_id?: string; model?: string };
    text  = (body.text ?? "").trim();
    voice = body.voice ?? body.voice_id ?? "nova";   // accept voice_id for backwards compat
    model = body.model ?? "tts-1-hd";
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!text) return new Response(JSON.stringify({ error: "text is required" }), { status: 400, headers: { ...CORS, "Content-Type": "application/json" } });

  // Sanitize & default unknown values
  if (!VALID_VOICES.has(voice)) voice = "nova";
  if (!VALID_MODELS.has(model)) model = "tts-1-hd";

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) return new Response(JSON.stringify({ error: "TTS not configured" }), { status: 500, headers: { ...CORS, "Content-Type": "application/json" } });

  const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: text.slice(0, 4096), voice, response_format: "mp3" }),
  });

  if (!ttsRes.ok) {
    const errText = await ttsRes.text().catch(() => "unknown");
    console.error("OpenAI TTS error:", ttsRes.status, errText);
    return new Response(JSON.stringify({ error: "TTS service error. Please try again." }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const audioBuffer = await ttsRes.arrayBuffer();
  return new Response(audioBuffer, {
    status: 200,
    headers: { ...CORS, "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
});
