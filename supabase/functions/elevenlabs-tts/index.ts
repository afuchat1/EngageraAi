/**
 * TTS Edge Function — backed by OpenAI TTS (tts-1 / nova voice)
 *
 * Keeps the same external interface as the old ElevenLabs function so the
 * frontend hook (usePhoneVoice.ts) requires zero changes.
 *
 * Request: POST JSON { text: string, voice_id?: string }
 * Response: binary MP3 audio
 */

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST")
    return new Response("Method Not Allowed", { status: 405, headers: CORS });

  let text = "";
  try {
    const body = await req.json() as { text?: string; voice_id?: string };
    text = (body.text ?? "").trim();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  if (!text) {
    return new Response(JSON.stringify({ error: "text is required" }), {
      status: 400, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "OPENAI_API_KEY not configured" }), {
      status: 500, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const orRes = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      model:           "tts-1",
      input:           text,
      voice:           "nova",      // clear, neutral, professional female voice
      response_format: "mp3",
    }),
  });

  if (!orRes.ok) {
    const errText = await orRes.text().catch(() => "unknown");
    console.error("OpenAI TTS error:", orRes.status, errText);
    return new Response(JSON.stringify({ error: "TTS service error. Please try again." }), {
      status: 502, headers: { ...CORS, "Content-Type": "application/json" },
    });
  }

  const audioBuffer = await orRes.arrayBuffer();
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      ...CORS,
      "Content-Type":   "audio/mpeg",
      "Cache-Control":  "no-store",
    },
  });
});
