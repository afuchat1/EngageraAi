/**
 * Supabase Edge Function: stt
 *
 * Accepts raw audio bytes → Pollinations (OpenAI Whisper) → transcript JSON.
 * Uses the same POLLINATIONS_API_KEY as the pollinations function — no extra secrets.
 *
 * POST /functions/v1/stt
 *   Body:   raw audio (audio/mp4, audio/webm, audio/wav, audio/ogg, audio/mpeg)
 *   Returns: { text: string }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** Map MIME types → file extensions Whisper accepts */
function audioExt(contentType: string): string {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (ct.includes("mp4") || ct.includes("m4a")) return "mp4";
  if (ct.includes("webm"))  return "webm";
  if (ct.includes("ogg"))   return "ogg";
  if (ct.includes("wav"))   return "wav";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  return "mp4"; // expo-audio default on mobile is .m4a / MPEG-4
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return jsonRes({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("POLLINATIONS_API_KEY");
  if (!apiKey) return jsonRes({ error: "STT service not configured (missing POLLINATIONS_API_KEY)" }, 503);

  const audioBytes = await req.arrayBuffer();
  if (audioBytes.byteLength < 100) return jsonRes({ error: "No audio data provided" }, 400);

  const contentType = req.headers.get("content-type") ?? "audio/mp4";
  const ext      = audioExt(contentType);
  const filename = `audio.${ext}`;

  // Pollinations exposes an OpenAI-compatible API — Whisper transcription endpoint
  const form = new FormData();
  form.append("file",            new Blob([audioBytes], { type: contentType }), filename);
  form.append("model",           "whisper-1");
  form.append("language",        "en");
  form.append("response_format", "json");
  form.append("temperature",     "0");

  try {
    const res = await fetch(
      "https://text.pollinations.ai/openai/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${apiKey}` }, body: form },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Pollinations STT error:", res.status, errText.slice(0, 300));
      return jsonRes({ error: "Transcription failed", status: res.status, detail: errText.slice(0, 200) }, 502);
    }

    const data = await res.json() as Record<string, unknown>;
    const text = (typeof data.text === "string" ? data.text : "").trim();
    return jsonRes({ text });
  } catch (err) {
    console.error("STT Edge Function error:", String(err));
    return jsonRes({ error: "STT unavailable", detail: String(err) }, 500);
  }
});
