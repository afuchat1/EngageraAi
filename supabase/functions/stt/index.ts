import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Supabase Edge Function: stt
 *
 * Accepts raw audio bytes → Groq Whisper → transcript JSON.
 *
 * POST /functions/v1/stt
 *   Body:   raw audio (audio/mp4, audio/webm, audio/wav, audio/ogg, audio/mpeg)
 *   Returns: { text: string }
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonRes(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
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
  if (!(await requireUser(req))) return jsonRes({ error: "Authentication required" }, 401);

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (!groqKey) return jsonRes({ error: "STT service not configured (missing GROQ_API_KEY)" }, 503);

  const audioBytes = await req.arrayBuffer();
  // Too small to contain any speech — return empty transcript silently (not an error)
  if (audioBytes.byteLength < 200) return jsonRes({ text: "" });

  const contentType = req.headers.get("content-type") ?? "audio/mp4";
  const ext      = audioExt(contentType);
  const filename = `audio.${ext}`;

  // Groq Whisper — fast, free, OpenAI-compatible transcription
  const form = new FormData();
  form.append("file",            new Blob([audioBytes], { type: contentType }), filename);
  form.append("model",           "whisper-large-v3-turbo");
  form.append("language",        "en");
  form.append("response_format", "json");
  form.append("temperature",     "0");

  try {
    const res = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      { method: "POST", headers: { Authorization: `Bearer ${groqKey}` }, body: form },
    );

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Groq STT error:", res.status, errText.slice(0, 300));
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
