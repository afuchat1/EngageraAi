import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function v21
 *
 * AI backend: Groq (llama-3.3-70b-versatile) — fast, free-tier, no credit card required.
 * Image generation: SVG via Groq chat completions (no image API credits needed).
 *
 * Logging:
 *   - console.log structured JSON at every stage
 *   - every request persisted to engagera_request_logs (fire-and-forget)
 */

// ── Model map ──────────────────────────────────────────────────────────────────
// All routes use Groq's free-tier llama models.
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_MODEL_FAST = "llama-3.1-8b-instant";

const MODEL_MAP: Record<string, string> = {
  "engagera-2.0":    GROQ_MODEL,
  "engagera-2.1":    GROQ_MODEL,
  "engagera-lite":   GROQ_MODEL_FAST,
  "engagera-pro":    GROQ_MODEL,
  "engagera-reason": GROQ_MODEL,
  "engagera-code":   GROQ_MODEL,
  "engagera-vision": GROQ_MODEL,
  "engagera-voice":  GROQ_MODEL_FAST,
  "engagera-image":  GROQ_MODEL,
};
const DEFAULT_MODEL = GROQ_MODEL;

// Model used for SVG image generation
const IMAGE_GEN_MODEL = GROQ_MODEL;

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const GUEST_LIMIT = 5;
const WINDOW_MS   = 24 * 60 * 60 * 1000;

// ── Image detection ────────────────────────────────────────────────────────────
const IMAGE_GEN_KEYWORDS = [
  "generate image", "generate a image", "generate an image",
  "generate picture", "generate a picture",
  "generate photo", "generate a photo",
  "generate art", "generate artwork",
  "generate illustration", "generate an illustration",
  "generate logo", "generate a logo",
  "create image", "create a image", "create an image",
  "create picture", "create a picture",
  "create photo", "create a photo",
  "create art", "create artwork",
  "create illustration", "create an illustration",
  "create logo", "create a logo",
  "make image", "make a image", "make an image",
  "make picture", "make a picture", "make me a picture",
  "make photo", "make a photo", "make me a photo",
  "make art", "make me art", "make artwork",
  "make illustration", "make an illustration",
  "make logo", "make a logo",
  "make me an image", "make me a image",
  "draw me", "draw a", "draw an",
  "show me a picture", "show me an image", "show me a photo",
  "show me a drawing", "show me a painting",
  "show me an illustration", "show me a logo",
  "paint a", "paint an", "paint me",
  "sketch a", "sketch an", "sketch me",
  "illustrate ", "illustrate a", "illustrate me",
  "design a logo", "design an image", "design a poster",
  "design a banner", "design a graphic",
  "design a thumbnail", "design a wallpaper",
  "render a", "render an", "render me",
  "picture of", "image of", "photo of",
  "drawing of", "painting of", "illustration of",
  "portrait of", "artwork of", "sketch of",
  "a picture of", "an image of", "a photo of",
  "a drawing of", "a painting of", "a portrait of",
  "can you draw", "can you paint", "can you sketch",
  "can you illustrate", "can you create an image",
  "can you make an image", "can you make a picture",
  "can you generate an image", "can you generate a picture",
  "could you draw", "could you paint", "could you sketch",
  "please draw", "please paint", "please create an image",
  "please generate", "please illustrate",
  "generate wallpaper", "create wallpaper", "make wallpaper",
  "generate poster", "create poster", "make poster",
  "generate banner", "create banner", "make banner",
  "generate thumbnail", "create thumbnail",
];

const IMAGE_GEN_PATTERNS: RegExp[] = [
  /\b(image|picture|photo|drawing|painting|illustration|portrait|artwork|sketch|graphic|poster|wallpaper|banner|logo|thumbnail)\s+of\b/i,
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a|an|the|some|my)?\s*\w/i,
  /\b(generate|create|make|produce|design)\b.{0,40}\b(image|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|visual|graphic)\b/i,
  /\bshow\s+me\s+(a|an|the|some)\b.{0,30}\b(image|picture|photo|drawing|painting|illustration|portrait|logo)\b/i,
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render|create|generate|make|design)\b/i,
  /\b(i want|i need|i'd like|give me)\s+(a|an|the)\s+(image|picture|photo|drawing|illustration|painting|artwork|visual)\b/i,
];

// ── System prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Engagera, a helpful AI assistant built by the AfuAI / Engagera team.

Identity rules:
- You were built by the AfuAI / Engagera team. Do NOT claim to be ChatGPT, Claude, Gemini, or any other named AI.
- If asked who made you, say you were built by the AfuAI / Engagera team.
- If asked about your underlying model, say you are powered by advanced language models optimized for the Engagera platform.
- Only state your name if directly asked. In normal conversation just respond helpfully.

Capabilities:
- You have comprehensive knowledge of the world: science, technology, history, mathematics, coding, creative writing, philosophy, law, medicine, business, art, and more.
- You can analyze images, explain concepts, write and debug code in any language, do math, and assist with any intellectual task.
- You can generate real images from text descriptions.
- Be thorough, accurate, and genuinely helpful.

Style:
- Be concise and helpful. Adapt tone to the user.
- Use markdown for code (always include the language tag), lists, and structured content.
- If unsure about something, say so rather than guessing.`;

const IMAGE_SYSTEM_PROMPT = `You are an expert SVG illustrator. When the user asks you to draw, create, or generate an image, respond with ONLY a single SVG code block — no text before or after, no explanations, just the code block.

Rules:
- Use viewBox="0 0 400 400" width="400" height="400"
- Create vivid, colorful, detailed artwork with gradients, multiple shapes, and depth
- Use <defs> for linearGradient and radialGradient where it adds quality
- Add subtle shadows or glow effects with filters when fitting
- No <script> tags, no external resources, no text inside SVG unless it's part of the art
- Aim for 30–80 SVG elements so the image looks rich, not sparse

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

// ── Helpers ────────────────────────────────────────────────────────────────────
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function log(level: "info" | "warn" | "error", event: string, data: Record<string, unknown>) {
  const entry = JSON.stringify({ level, event, ts: new Date().toISOString(), ...data });
  if (level === "error") console.error(entry);
  else if (level === "warn") console.warn(entry);
  else console.log(entry);
}

type ContentPart   = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
type MessageContent = string | ContentPart[];
interface IncomingMessage { role: string; content: MessageContent; }

function isValidMessage(m: unknown): m is IncomingMessage {
  if (!m || typeof m !== "object") return false;
  const msg = m as Record<string, unknown>;
  if (!["user", "assistant", "system"].includes(msg.role as string)) return false;
  return typeof msg.content === "string" || Array.isArray(msg.content);
}

function getTextPreview(content: MessageContent): string {
  if (typeof content === "string") return content;
  const textPart = content.find((p): p is { type: "text"; text: string } => p.type === "text");
  return textPart?.text ?? "";
}

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
  const PROMPT_STRIP = [
    /generate (an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) of /i,
    /create (an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) (of |showing |depicting )?/i,
    /make (me )?(an? )?(image|picture|photo|illustration|art|logo|drawing|sketch) (of |showing |depicting )?/i,
    /draw (me )?(an? )?/i,
    /illustrate (an? )?/i,
    /paint (an? )?/i,
    /sketch (an? )?/i,
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
  for (const re of PROMPT_STRIP) {
    prompt = prompt.replace(re, "").trim();
  }
  return prompt || getTextPreview(lastUser.content).trim() || "a beautiful scene";
}

async function callGroq(
  groqKey: string,
  model: string,
  messages: { role: string; content: string | MessageContent }[],
  maxTokens: number,
  requestId: string,
): Promise<{ ok: boolean; content: string; inputTokens: number; outputTokens: number; errorDetail?: string }> {
  let res: Response;
  try {
    res = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type":  "application/json",
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens }),
    });
  } catch (err) {
    log("error", "groq.unreachable", { requestId, error: String(err) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("error", "groq.http_error", { requestId, status: res.status, error: errText.slice(0, 300) });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res.status}: ${errText.slice(0, 100)}` };
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
    usage?:   { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
    error?:   { message?: string };
  };

  if (data.error) {
    log("error", "groq.api_error", { requestId, error: data.error.message });
    return { ok: false, content: "", inputTokens: 0, outputTokens: 0, errorDetail: data.error.message };
  }

  const content      = data.choices?.[0]?.message?.content ?? "";
  const inputTokens  = data.usage?.prompt_tokens     ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  return { ok: true, content, inputTokens, outputTokens };
}

async function persistLog(db: ReturnType<typeof createClient>, logEntry: Record<string, unknown>, startTime: number): Promise<void> {
  logEntry.latency_ms  = Date.now() - startTime;
  logEntry.total_tokens = (logEntry.input_tokens as number ?? 0) + (logEntry.output_tokens as number ?? 0);
  try {
    await db.from("engagera_request_logs").insert(logEntry);
  } catch { /* fire-and-forget */ }
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  const requestId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  const logEntry: Record<string, unknown> = {
    request_id:    requestId,
    model:         "engagera-2.0",
    path:          "chat",
    success:       false,
    error_code:    null,
    latency_ms:    0,
    input_tokens:  0,
    output_tokens: 0,
    total_tokens:  0,
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const groqKey     = Deno.env.get("GROQ_API_KEY") ?? "";

    if (!supabaseUrl) return json({ error: "SUPABASE_URL not configured" }, 500);
    if (!serviceKey)  return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
    if (!groqKey)     return json({ error: "GROQ_API_KEY not configured" }, 500);

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { messages, model = "engagera-2.0", conversationId, contextHint } = body as {
      messages:        unknown[];
      model?:          string;
      conversationId?: number;
      contextHint?:    string;
    };

    logEntry.model = model;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const validMessages = messages.filter(isValidMessage);
    if (validMessages.length === 0) return json({ error: "No valid messages" }, 400);

    // ── Auth ──────────────────────────────────────────────────────────────────
    let userId:         string | undefined;
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
      if (!guestSessionId) {
        return json({ error: "Authentication or guest session required" }, 401);
      }

      // ── Guest rate limiting ──────────────────────────────────────────────
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
          session_id:    guestSessionId,
          message_count: 0,
          window_start:  now.toISOString(),
          last_seen_at:  now.toISOString(),
        });
        if (insertError) {
          log("error", "guest.session_create_failed", { requestId, error: JSON.stringify(insertError) });
          return json({ error: "Session create failed" }, 500);
        }
      } else {
        const windowAge = now.getTime() - new Date(session.window_start).getTime();
        if (windowAge >= WINDOW_MS) {
          await db.from("engagera_guest_sessions").update({
            message_count: 0,
            window_start:  now.toISOString(),
            last_seen_at:  now.toISOString(),
          }).eq("session_id", guestSessionId);
        } else if (session.message_count >= GUEST_LIMIT) {
          const resetAt = new Date(new Date(session.window_start).getTime() + WINDOW_MS);
          return json({
            error:             "Daily message limit reached. Sign up for unlimited access.",
            windowResetAt:     resetAt.toISOString(),
            guestMessageCount: session.message_count,
            guestMessageLimit: GUEST_LIMIT,
          }, 429);
        }
      }
    }

    logEntry.user_id          = userId ?? null;
    logEntry.guest_session_id = guestSessionId ?? null;

    // ── Route: image gen or chat ──────────────────────────────────────────────
    const isImageModel     = model === "engagera-image";
    const is21ImageRequest = (model === "engagera-2.1" || model === "engagera-2.0") && isImageGenRequest(validMessages);
    const generateImage    = isImageModel || is21ImageRequest;
    const path             = generateImage ? "image_gen" : "chat";
    logEntry.path = path;

    const lastUserMsg   = [...validMessages].reverse().find((m) => m.role === "user");
    const promptPreview = (lastUserMsg ? getTextPreview(lastUserMsg.content) : "").slice(0, 120);
    logEntry.prompt_preview = promptPreview;

    const groqModel = MODEL_MAP[model] ?? DEFAULT_MODEL;

    log("info", "request.start", {
      requestId, model, groqModel, path,
      authed: !!userId, messageCount: validMessages.length, promptPreview,
    });

    // ── Build reply ───────────────────────────────────────────────────────────
    let reply = "";
    let inputTokens = 0, outputTokens = 0, totalTokens = 0;

    if (generateImage) {
      const imagePrompt = extractImagePrompt(validMessages);
      log("info", "image_gen.start", { requestId, imagePrompt: imagePrompt.slice(0, 100) });

      const svgMessages = [
        { role: "system", content: IMAGE_SYSTEM_PROMPT },
        { role: "user",   content: imagePrompt },
      ];

      const result = await callGroq(groqKey, IMAGE_GEN_MODEL, svgMessages, 4096, requestId);
      if (result.ok && (result.content.includes("```svg") || result.content.includes("<svg"))) {
        reply        = result.content;
        inputTokens  = result.inputTokens;
        outputTokens = result.outputTokens;
        totalTokens  = result.inputTokens + result.outputTokens;
        log("info", "image_gen.delivered", { requestId, inputTokens, outputTokens });
      } else {
        reply = "I wasn't able to generate that image right now. Please try again in a moment.";
        logEntry.error_code = `image_gen_failed: ${result.errorDetail ?? "no svg block"}`;
        log("error", "image_gen.failed", { requestId, errorDetail: result.errorDetail });
      }
    } else {
      const systemContent = contextHint
        ? `${SYSTEM_PROMPT}\n\n[User context] ${contextHint}`
        : SYSTEM_PROMPT;

      const groqMessages = [
        { role: "system", content: systemContent },
        ...validMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({
            role:    m.role,
            content: typeof m.content === "string" ? m.content : getTextPreview(m.content),
          })),
      ];

      log("info", "chat.groq_call", { requestId, groqModel, messageCount: groqMessages.length });

      const result = await callGroq(groqKey, groqModel, groqMessages, 2048, requestId);
      if (!result.ok) {
        logEntry.error_code = `groq_error: ${result.errorDetail}`;
        await persistLog(db, logEntry, startTime);
        return json({ error: "AI service error. Please try again." }, 502);
      }

      reply        = result.content;
      inputTokens  = result.inputTokens;
      outputTokens = result.outputTokens;
      totalTokens  = result.inputTokens + result.outputTokens;

      log("info", "chat.groq_ok", { requestId, replyLen: reply.length, inputTokens, outputTokens, totalTokens });
    }

    logEntry.input_tokens  = inputTokens;
    logEntry.output_tokens = outputTokens;
    logEntry.total_tokens  = totalTokens;

    // ── Persist conversation (fire-and-forget errors) ─────────────────────────
    let convId: number | undefined = conversationId;
    try {
      if (!convId) {
        const insert: Record<string, unknown> = {
          title: promptPreview.slice(0, 60) || "New conversation",
          model,
        };
        if (userId) insert.user_id = userId;
        else        insert.guest_session_id = guestSessionId;

        const { data, error: convErr } = await db
          .from("engagera_conversations")
          .insert(insert)
          .select("id")
          .single();
        if (convErr) log("warn", "conv.insert_failed", { requestId, error: JSON.stringify(convErr) });
        convId = data?.id;
      } else {
        await db.from("engagera_conversations")
          .update({ updated_at: new Date().toISOString(), model })
          .eq("id", convId);
      }

      if (convId) {
        const msgSaves: Promise<unknown>[] = [
          db.from("engagera_messages").insert({
            conversation_id: convId,
            role:            "assistant",
            content:         reply,
            token_count:     totalTokens,
          }),
          db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
        ];
        if (lastUserMsg) {
          const userText = typeof lastUserMsg.content === "string"
            ? lastUserMsg.content
            : JSON.stringify(lastUserMsg.content);
          msgSaves.push(db.from("engagera_messages").insert({
            conversation_id: convId,
            role:            "user",
            content:         userText,
            token_count:     0,
          }));
        }
        await Promise.allSettled(msgSaves);
      }
    } catch (err) {
      log("warn", "conv.persist_failed", { requestId, error: String(err) });
    }

    // ── Usage record for authenticated users ──────────────────────────────────
    if (userId) {
      try {
        await db.from("engagera_usage_records").insert({
          user_id:       userId,
          model,
          input_tokens:  inputTokens,
          output_tokens: outputTokens,
          total_tokens:  totalTokens,
        });
      } catch { /* non-fatal */ }
    }

    // ── Guest counter increment ────────────────────────────────────────────────
    let newGuestCount: number | undefined;
    if (guestSessionId) {
      try {
        const { data } = await db.rpc("engagera_increment_guest_count", {
          p_session_id: guestSessionId,
        });
        newGuestCount = typeof data === "number" ? data : undefined;
      } catch { /* non-fatal */ }
    }

    logEntry.success = true;
    await persistLog(db, logEntry, startTime);

    return json({
      id:    requestId,
      model,
      message: { role: "assistant", content: reply },
      usage: { inputTokens, outputTokens, totalTokens },
      conversationId: convId,
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
