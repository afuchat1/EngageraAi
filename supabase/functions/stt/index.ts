/**
 * Supabase Edge Function: stt
 *
 * Accepts raw audio bytes → Groq Whisper large-v3-turbo → transcript JSON.
 * Groq is ultra-fast (~1 s) and uses the GROQ_API_KEY already in Supabase secrets.
 *
 * POST /functions/v1/stt
 *   Body:   raw audio (audio/webm, audio/wav, audio/ogg, audio/mp4, audio/mpeg)
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

/** Map browser MIME types → file extensions Groq accepts */
function audioExt(contentType: string): string {
  const ct = contentType.toLowerCase().split(";")[0].trim();
  if (ct.includes("webm"))  return "webm";
  if (ct.includes("ogg"))   return "ogg";
  if (ct.includes("wav"))   return "wav";
  if (ct.includes("mp4"))   return "mp4";
  if (ct.includes("mpeg") || ct.includes("mp3")) return "mp3";
  return "webm"; // MediaRecorder default
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return jsonRes({ error: "Method not allowed" }, 405);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return jsonRes({ error: "STT service not configured" }, 503);

  const audioBytes = await req.arrayBuffer();
  if (audioBytes.byteLength < 100) return jsonRes({ error: "No audio data provided" }, 400);

  const contentType = req.headers.get("content-type") ?? "audio/webm";
  const ext      = audioExt(contentType);
  const filename = `audio.${ext}`;

  // Groq Whisper API — multipart/form-data
  const form = new FormData();
  form.append("file",        new Blob([audioBytes], { type: contentType }), filename);
  form.append("model",       "whisper-large-v3-turbo");
  form.append("language",    "en");
  form.append("response_format", "json");
  form.append("temperature", "0");

  try {
    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: form },
    );

    if (!groqRes.ok) {
      const errText = await groqRes.text().catch(() => "");
      console.error("Groq Whisper error:", groqRes.status, errText.slice(0, 300));
      return jsonRes({ error: "Transcription failed", status: groqRes.status }, 502);
    }

    const data = await groqRes.json() as Record<string, unknown>;
    const text = (typeof data.text === "string" ? data.text : "").trim();
    return jsonRes({ text });
  } catch (err) {
    console.error("STT Edge Function error:", String(err));
    return jsonRes({ error: "STT unavailable", detail: String(err) }, 500);
  }
});
