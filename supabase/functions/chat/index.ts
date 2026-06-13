import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function v20
 *
 * Paths:
 *   - image_gen  → FLUX-1-schnell (free) → DALL-E 3 fallback
 *   - chat       → GPT-4o-mini via OpenRouter (gpt-4o credits exhausted)
 *
 * Logging:
 *   - console.log structured JSON at every stage (visible in Supabase Functions → Logs)
 *   - every request persisted to public.engagera_request_logs (fire-and-forget)
 */

// ── Model map ──────────────────────────────────────────────────────────────────
// NOTE: openai/gpt-4o credits exhausted on this OpenRouter key (confirmed June 2026).
// All chat routes use gpt-4o-mini which is confirmed working.
const MODEL_MAP: Record<string, string> = {
  "engagera-2.0":    "openai/gpt-4o-mini",
  "engagera-2.1":    "openai/gpt-4o-mini",
  "engagera-lite":   "openai/gpt-4o-mini",
  "engagera-pro":    "openai/gpt-4o-mini",
  "engagera-reason": "openai/gpt-4o-mini",
  "engagera-code":   "openai/gpt-4o-mini",
  "engagera-vision": "openai/gpt-4o-mini",
  "engagera-voice":  "openai/gpt-4o-mini",
  "engagera-image":  "openai/dall-e-3",
};
const DEFAULT_MODEL = "openai/gpt-4o-mini";

// Model used for SVG image generation (must support chat completions)
const IMAGE_GEN_MODEL = "openai/gpt-4o-mini";

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

/**
 * System prompt used when generating SVG images via chat completions.
 * The LLM outputs a single ```svg code block; the frontend SvgBlock renders it.
 */
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

/** Structured logger — all output visible in Supabase Functions → Logs */
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
    /generate (an? )?(photo) of /i,
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

/**
 * Generate an SVG image via chat completions (no image-API credits required).
 * The LLM outputs a ```svg code block; the frontend SvgBlock renders it inline.
 */
async function generateSvgImage(
  prompt: string,
  orKey: string,
  requestId: string,
): Promise<{ svgBlock: string | null; latencyMs: number; inputTokens: number; outputTokens: number; errorDetail?: string }> {
  const t = Date.now();

  const messages = [
    { role: "system", content: IMAGE_SYSTEM_PROMPT },
    { role: "user",   content: prompt },
  ];

  log("info", "image_gen.svg_call", { requestId, model: IMAGE_GEN_MODEL, promptLen: prompt.length });

  let res: Response;
  try {
    res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${orKey}`,
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://engagera.afuchat.com",
        "X-Title":       "Engagera AI",
      },
      body: JSON.stringify({ model: IMAGE_GEN_MODEL, messages, max_tokens: 4096 }),
    });
  } catch (err) {
    const latencyMs = Date.now() - t;
    log("error", "image_gen.svg_unreachable", { requestId, error: String(err) });
    return { svgBlock: null, latencyMs, inputTokens: 0, outputTokens: 0, errorDetail: String(err) };
  }

  const latencyMs = Date.now() - t;

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    log("error", "image_gen.svg_failed", { requestId, status: res.status, error: errText.slice(0, 200), latencyMs });
    return { svgBlock: null, latencyMs, inputTokens: 0, outputTokens: 0, errorDetail: `HTTP ${res.status}` };
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
    usage?:   { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const inputTokens  = data.usage?.prompt_tokens     ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;
  const content      = data.choices?.[0]?.message?.content ?? "";

  // The model should return a ```svg ... ``` block — pass it through as-is
  const hasSvg = content.includes("```svg") || content.includes("<svg");
  if (!hasSvg) {
    log("warn", "image_gen.svg_no_block", { requestId, contentPreview: content.slice(0, 200), latencyMs });
    return { svgBlock: null, latencyMs, inputTokens, outputTokens, errorDetail: "no SVG block in response" };
  }

  log("info", "image_gen.svg_success", { requestId, latencyMs, inputTokens, outputTokens, chars: content.length });
  return { svgBlock: content, latencyMs, inputTokens, outputTokens };
}

// ── Main handler ───────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  const requestId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const startTime = Date.now();

  // Track what we'll write to request_logs at the end
  const logEntry: Record<string, unknown> = {
    request_id: requestId,
    model:      "engagera-2.0",
    path:       "chat",
    success:    false,
    error_code: null,
    latency_ms: 0,
    input_tokens:  0,
    output_tokens: 0,
    total_tokens:  0,
  };

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const orKey       = Deno.env.get("OPENROUTER_API_KEY") ?? "";

    if (!supabaseUrl) { log("error", "config.missing", { requestId, var: "SUPABASE_URL" }); return json({ error: "SUPABASE_URL not configured" }, 500); }
    if (!serviceKey)  { log("error", "config.missing", { requestId, var: "SUPABASE_SERVICE_ROLE_KEY" }); return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500); }
    if (!orKey)       { log("error", "config.missing", { requestId, var: "OPENROUTER_API_KEY" }); return json({ error: "OPENROUTER_API_KEY not configured" }, 500); }

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
        log("warn", "auth.missing", { requestId });
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
        log("info", "guest.session_created", { requestId, guestSessionId });
      } else {
        const windowAge = now.getTime() - new Date(session.window_start).getTime();
        if (windowAge >= WINDOW_MS) {
          await db.from("engagera_guest_sessions").update({
            message_count: 0,
            window_start:  now.toISOString(),
            last_seen_at:  now.toISOString(),
          }).eq("session_id", guestSessionId);
          log("info", "guest.window_reset", { requestId, guestSessionId });
        } else if (session.message_count >= GUEST_LIMIT) {
          const resetAt = new Date(new Date(session.window_start).getTime() + WINDOW_MS);
          log("warn", "guest.rate_limited", { requestId, guestSessionId, count: session.message_count });
          return json({
            error:             "Daily message limit reached. Sign up for unlimited access.",
            windowResetAt:     resetAt.toISOString(),
            guestMessageCount: session.message_count,
            guestMessageLimit: GUEST_LIMIT,
          }, 429);
        }
      }
    }

    logEntry.user_id         = userId ?? null;
    logEntry.guest_session_id = guestSessionId ?? null;

    // ── Route: image gen or chat ──────────────────────────────────────────────
    const isImageModel     = model === "engagera-image";
    const is21ImageRequest = (model === "engagera-2.1" || model === "engagera-2.0") && isImageGenRequest(validMessages);
    const generateImage    = isImageModel || is21ImageRequest;
    const path             = generateImage ? "image_gen" : "chat";

    logEntry.path = path;

    const lastUserMsg  = [...validMessages].reverse().find((m) => m.role === "user");
    const promptPreview = (lastUserMsg ? getTextPreview(lastUserMsg.content) : "").slice(0, 120);
    logEntry.prompt_preview = promptPreview;

    const orModel = MODEL_MAP[model] ?? DEFAULT_MODEL;

    log("info", "request.start", {
      requestId,
      model,
      orModel: generateImage ? IMAGE_GEN_MODEL : orModel,
      path,
      authed: !!userId,
      messageCount: validMessages.length,
      promptPreview,
    });

    // ── Build reply ───────────────────────────────────────────────────────────
    let reply = "";
    let inputTokens = 0, outputTokens = 0, totalTokens = 0;

    if (generateImage) {
      const imagePrompt = extractImagePrompt(validMessages);
      log("info", "image_gen.start", { requestId, imagePrompt: imagePrompt.slice(0, 100) });

      const { svgBlock, latencyMs: imgLatency, inputTokens: imgIn, outputTokens: imgOut, errorDetail } =
        await generateSvgImage(imagePrompt, orKey, requestId);

      if (svgBlock) {
        reply        = svgBlock;
        inputTokens  = imgIn;
        outputTokens = imgOut;
        totalTokens  = imgIn + imgOut;
        log("info", "image_gen.delivered", { requestId, imgLatency, promptLen: imagePrompt.length, inputTokens, outputTokens });
      } else {
        reply = "I wasn't able to generate that image right now. Please try again in a moment.";
        logEntry.error_code = `image_gen_failed: ${errorDetail ?? "unknown"}`;
        log("error", "image_gen.failed", { requestId, imgLatency, errorDetail });
      }
    } else {
      const systemContent = contextHint
        ? `${SYSTEM_PROMPT}\n\n[User context] ${contextHint}`
        : SYSTEM_PROMPT;

      const orMessages = [
        { role: "system", content: systemContent },
        ...validMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      ];

      log("info", "chat.openrouter_call", { requestId, orModel, messageCount: orMessages.length });

      let orRes: Response;
      try {
        orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${orKey}`,
            "Content-Type":  "application/json",
            "HTTP-Referer":  "https://engagera.afuchat.com",
            "X-Title":       "Engagera AI",
          },
          body: JSON.stringify({ model: orModel, messages: orMessages, max_tokens: 2048 }),
        });
      } catch (fetchErr) {
        log("error", "chat.openrouter_unreachable", { requestId, error: String(fetchErr) });
        logEntry.error_code = "openrouter_unreachable";
        await persistLog(db, logEntry, startTime);
        return json({ error: "Failed to reach AI service. Please try again." }, 502);
      }

      if (!orRes.ok) {
        const errText = await orRes.text().catch(() => "unknown");
        log("error", "chat.openrouter_error", { requestId, status: orRes.status, error: errText.slice(0, 300) });
        logEntry.error_code = `openrouter_http_${orRes.status}`;
        await persistLog(db, logEntry, startTime);
        return json({ error: "AI service error. Please try again." }, 502);
      }

      const orData = await orRes.json() as {
        choices?: { message?: { content?: string } }[];
        usage?:   { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        error?:   { message?: string };
      };

      // Check for API-level error inside 200 response (OpenRouter quirk)
      if (orData.error) {
        log("error", "chat.openrouter_api_error", { requestId, error: orData.error.message });
        logEntry.error_code = "openrouter_api_error";
        await persistLog(db, logEntry, startTime);
        return json({ error: "AI returned an error. Please try again." }, 502);
      }

      reply = orData.choices?.[0]?.message?.content ?? "";

      // ── Capture real token usage (fix: was always 0 before) ────────────────
      inputTokens  = orData.usage?.prompt_tokens     ?? 0;
      outputTokens = orData.usage?.completion_tokens ?? 0;
      totalTokens  = orData.usage?.total_tokens      ?? 0;

      log("info", "chat.openrouter_ok", {
        requestId,
        replyLen: reply.length,
        inputTokens,
        outputTokens,
        totalTokens,
      });
    }

    logEntry.input_tokens  = inputTokens;
    logEntry.output_tokens = outputTokens;
    logEntry.total_tokens  = totalTokens;

    // ── Persist conversation ──────────────────────────────────────────────────
    let convId: number | undefined = conversationId;
    try {
      const textPreview = promptPreview;

      if (!convId) {
        const insert: Record<string, unknown> = {
          title: textPreview.slice(0, 60) || "New conversation",
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
        if (convId) log("info", "conv.created", { requestId, convId });
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
      } catch (e) {
        log("warn", "usage.record_failed", { requestId, error: String(e) });
      }
    }

    // ── Guest counter increment ────────────────────────────────────────────────
    let newGuestCount: number | undefined;
    if (guestSessionId) {
      try {
        const { data } = await db.rpc("engagera_increment_guest_count", {
          p_session_id: guestSessionId,
        });
        newGuestCount = typeof data === "number" ? data : undefined;
      } catch (e) {
        log("warn", "guest.increment_failed", { requestId, error: String(e) });
      }
    }

    // ── Success log + DB persist ───────────────────────────────────────────────
    logEntry.success    = true;
    logEntry.error_code = null;
    const latencyMs = Date.now() - startTime;
    logEntry.latency_ms = latencyMs;

    log("info", "request.complete", {
      requestId, model, path, latencyMs,
      inputTokens, outputTokens, totalTokens,
      convId: convId ?? null,
      authed: !!userId,
    });

    // Fire-and-forget — don't let log write block the response
    persistLog(db, logEntry, startTime).catch((e) =>
      log("warn", "request_log.write_failed", { requestId, error: String(e) })
    );

    return json({
      id:      requestId,
      model,
      message: { role: "assistant", content: reply },
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
      },
      conversationId: convId,
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount,
        guestMessageLimit: GUEST_LIMIT,
      }),
    });

  } catch (topErr) {
    const latencyMs = Date.now() - startTime;
    log("error", "request.unhandled_error", { requestId, error: String(topErr), latencyMs });
    logEntry.error_code = `unhandled: ${String(topErr).slice(0, 100)}`;
    logEntry.latency_ms = latencyMs;
    // Fire-and-forget error log
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supabaseUrl && serviceKey) {
        const db = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
        persistLog(db, logEntry, startTime).catch(() => {});
      }
    } catch (_) { /* ignore */ }
    return json({ error: "Internal error. Please try again." }, 500);
  }
});

// ── DB log persistence (fire-and-forget safe) ──────────────────────────────────
async function persistLog(
  db: ReturnType<typeof createClient>,
  entry: Record<string, unknown>,
  startTime: number,
): Promise<void> {
  const latencyMs = entry.latency_ms ?? (Date.now() - startTime);
  const { error } = await db.from("engagera_request_logs").insert({
    request_id:       entry.request_id,
    user_id:          entry.user_id ?? null,
    guest_session_id: entry.guest_session_id ?? null,
    model:            entry.model ?? "unknown",
    path:             entry.path ?? "unknown",
    success:          entry.success ?? false,
    error_code:       entry.error_code ?? null,
    latency_ms:       latencyMs,
    input_tokens:     entry.input_tokens ?? 0,
    output_tokens:    entry.output_tokens ?? 0,
    total_tokens:     entry.total_tokens ?? 0,
    prompt_preview:   (entry.prompt_preview as string | undefined)?.slice(0, 120) ?? null,
  });
  if (error) {
    console.warn(JSON.stringify({ level: "warn", event: "request_log.db_error", error: JSON.stringify(error) }));
  }
}
