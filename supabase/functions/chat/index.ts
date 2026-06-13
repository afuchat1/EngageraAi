import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Engagera Chat Edge Function
 *
 * Model map — Engagera public IDs → OpenRouter internal IDs
 * engagera-2.0  Primary — full world knowledge, no image generation
 * engagera-2.1  Latest  — everything + REAL image generation (DALL-E 3) + vision
 *
 * Image generation flow:
 *   1. Detect image request via keywords
 *   2. Extract clean prompt from user message
 *   3. Call OpenRouter /v1/images/generations with dall-e-3
 *   4. Return URL embedded in markdown → frontend renders via <img>
 *   5. If image API fails, return a clear error (no silent SVG fallback)
 */

const MODEL_MAP: Record<string, string> = {
  "engagera-2.0":    "openai/gpt-4o",
  "engagera-2.1":    "openai/gpt-4o",
  "engagera-lite":   "openai/gpt-4o-mini",
  "engagera-pro":    "openai/gpt-4o",
  "engagera-reason": "openai/gpt-4o",
  "engagera-code":   "openai/gpt-4o",
  "engagera-vision": "openai/gpt-4o",
  "engagera-voice":  "openai/gpt-4o-mini",
  "engagera-image":  "openai/gpt-4o",
};
const DEFAULT_MODEL = "openai/gpt-4o";

const GUEST_LIMIT = 5;
const WINDOW_MS   = 24 * 60 * 60 * 1000;

// Keywords that trigger image generation (checked against last user message)
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

// Regex patterns for broader image detection
const IMAGE_GEN_PATTERNS: RegExp[] = [
  /\b(image|picture|photo|drawing|painting|illustration|portrait|artwork|sketch|graphic|poster|wallpaper|banner|logo|thumbnail)\s+of\b/i,
  /\b(draw|paint|sketch|illustrate|render)\s+(me\s+)?(a|an|the|some|my)?\s*\w/i,
  /\b(generate|create|make|produce|design)\b.{0,40}\b(image|picture|photo|drawing|illustration|artwork|logo|poster|wallpaper|banner|thumbnail|visual|graphic)\b/i,
  /\bshow\s+me\s+(a|an|the|some)\b.{0,30}\b(image|picture|photo|drawing|painting|illustration|portrait|logo)\b/i,
  /\b(can|could|please|would you|will you)\s+you\s+(draw|paint|sketch|illustrate|render|create|generate|make|design)\b/i,
  /\b(i want|i need|i'd like|give me)\s+(a|an|the)\s+(image|picture|photo|drawing|illustration|painting|artwork|visual)\b/i,
];

// Prefixes to strip so the raw user message becomes a clean image prompt
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
];

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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
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

/** Strip image-request prefixes and return a clean prompt for the image API */
function extractImagePrompt(messages: IncomingMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "a beautiful scene";
  let prompt = getTextPreview(lastUser.content).trim();
  for (const re of PROMPT_STRIP) {
    prompt = prompt.replace(re, "").trim();
  }
  return prompt || getTextPreview(lastUser.content).trim() || "a beautiful scene";
}

/**
 * Call OpenRouter's DALL-E 3 image generation endpoint.
 * Returns the public image URL on success, or null on failure.
 */
async function generateRealImage(prompt: string, orKey: string): Promise<string | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/images/generations", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${orKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://engagera.afuchat.com",
        "X-Title": "Engagera AI",
      },
      body: JSON.stringify({
        model:   "openai/dall-e-3",
        prompt:  prompt,
        n:       1,
        size:    "1024x1024",
        quality: "standard",
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Image gen error:", res.status, errText);
      return null;
    }

    const data = await res.json() as { data?: { url?: string; revised_prompt?: string }[] };
    const url = data.data?.[0]?.url;
    return url ?? null;
  } catch (err) {
    console.error("Image gen fetch error:", String(err));
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST")   return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const orKey       = Deno.env.get("OPENROUTER_API_KEY") ?? "";

    if (!supabaseUrl) return json({ error: "SUPABASE_URL not configured" }, 500);
    if (!serviceKey)  return json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, 500);
    if (!orKey)       return json({ error: "OPENROUTER_API_KEY not configured" }, 500);

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

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const validMessages = messages.filter(isValidMessage);
    if (validMessages.length === 0) return json({ error: "No valid messages" }, 400);

    // ── Auth ─────────────────────────────────────────────────────────────────
    let userId:         string | undefined;
    let guestSessionId: string | undefined;

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token   = authHeader.slice(7);
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
      if (token && token !== anonKey) {
        const { data } = await db.auth.getUser(token);
        userId = data.user?.id;
      }
    }

    if (!userId) {
      guestSessionId = req.headers.get("x-guest-session-id") ?? undefined;
      if (!guestSessionId) return json({ error: "Authentication or guest session required" }, 401);

      // ── Guest rate limiting ───────────────────────────────────────────────
      const now = new Date();
      const { data: session, error: sessionError } = await db
        .from("engagera_guest_sessions")
        .select("message_count, window_start")
        .eq("session_id", guestSessionId)
        .maybeSingle();

      if (sessionError) {
        console.error("Guest session lookup error:", JSON.stringify(sessionError));
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
          console.error("Guest session insert error:", JSON.stringify(insertError));
          return json({ error: "Session create failed" }, 500);
        }
      } else {
        const windowAge = now.getTime() - new Date(session.window_start).getTime();
        if (windowAge >= WINDOW_MS) {
          // Window expired — reset counter
          await db.from("engagera_guest_sessions").update({
            message_count: 0,
            window_start:  now.toISOString(),
            last_seen_at:  now.toISOString(),
          }).eq("session_id", guestSessionId);
        } else if (session.message_count >= GUEST_LIMIT) {
          // ── LIMIT ENFORCED — hard block ────────────────────────────────────
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

    // ── Detect image generation request ──────────────────────────────────────
    const isImageModel     = model === "engagera-image";
    const is21ImageRequest = (model === "engagera-2.1" || model === "engagera-2.0") && isImageGenRequest(validMessages);
    const generateImage    = isImageModel || is21ImageRequest;

    const orModel = MODEL_MAP[model] ?? DEFAULT_MODEL;

    // ── Build reply ───────────────────────────────────────────────────────────
    let reply = "";

    if (generateImage) {
      // ── Real image generation path ────────────────────────────────────────
      const imagePrompt = extractImagePrompt(validMessages);
      console.log("Image gen prompt:", imagePrompt);

      const imageUrl = await generateRealImage(imagePrompt, orKey);

      if (imageUrl) {
        // Return markdown with embedded image — MessageContent renders it via <img>
        reply = `![${imagePrompt}](${imageUrl})`;
      } else {
        // Image API failed — tell the user clearly instead of silently returning SVG
        reply = "I wasn't able to generate that image right now. The image service may be temporarily unavailable. Please try again in a moment, or describe what you'd like and I'll help in another way.";
      }
    } else {
      // ── Normal chat completion path ───────────────────────────────────────
      const systemContent = contextHint
        ? `${SYSTEM_PROMPT}\n\n[User context] ${contextHint}`
        : SYSTEM_PROMPT;

      const orMessages = [
        { role: "system", content: systemContent },
        ...validMessages
          .filter((m) => m.role !== "system")
          .map((m) => ({ role: m.role, content: m.content })),
      ];

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
        console.error("OpenRouter fetch error:", String(fetchErr));
        return json({ error: "Failed to reach AI service" }, 502);
      }

      if (!orRes.ok) {
        const errText = await orRes.text().catch(() => "unknown");
        console.error("OpenRouter error:", orRes.status, errText);
        return json({ error: "AI service error. Please try again." }, 502);
      }

      const orData = await orRes.json() as {
        choices?: { message?: { content?: string } }[];
        usage?:   { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };
      reply = orData.choices?.[0]?.message?.content ?? "";
    }

    // ── Usage (approximate for image gen) ────────────────────────────────────
    const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // ── Persist conversation ──────────────────────────────────────────────────
    let convId: number | undefined = conversationId;
    try {
      const lastUser    = [...validMessages].reverse().find((m) => m.role === "user");
      const textPreview = lastUser ? getTextPreview(lastUser.content) : "";

      if (!convId) {
        const insert: Record<string, unknown> = {
          title: textPreview.slice(0, 60) || "New conversation",
          model,
        };
        if (userId) insert.user_id = userId;
        else        insert.guest_session_id = guestSessionId;

        const { data } = await db.from("engagera_conversations").insert(insert).select("id").single();
        convId = data?.id;
      } else {
        await db.from("engagera_conversations")
          .update({ updated_at: new Date().toISOString(), model })
          .eq("id", convId);
      }

      if (convId) {
        const lastUser2  = [...validMessages].reverse().find((m) => m.role === "user");
        const msgSaves: Promise<unknown>[] = [
          db.from("engagera_messages").insert({
            conversation_id: convId,
            role:            "assistant",
            content:         reply,
            token_count:     usage.total_tokens,
          }),
          db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
        ];
        if (lastUser2) {
          const userText = typeof lastUser2.content === "string"
            ? lastUser2.content
            : JSON.stringify(lastUser2.content);
          msgSaves.push(db.from("engagera_messages").insert({
            conversation_id: convId,
            role:            "user",
            content:         userText,
            token_count:     0,
          }));
        }
        await Promise.all(msgSaves);
      }
    } catch (err) {
      console.warn("Conversation persist failed (non-fatal):", String(err));
    }

    // ── Usage record ──────────────────────────────────────────────────────────
    if (userId) {
      try {
        await db.from("engagera_usage_records").insert({
          user_id:       userId,
          model,
          input_tokens:  usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          total_tokens:  usage.total_tokens,
        });
      } catch (e) {
        console.warn("Usage record failed:", String(e));
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
        console.warn("Guest count increment failed:", String(e));
      }
    }

    return json({
      id:      `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      model,
      message: { role: "assistant", content: reply },
      usage: {
        inputTokens:  usage.prompt_tokens,
        outputTokens: usage.completion_tokens,
        totalTokens:  usage.total_tokens,
      },
      conversationId: convId,
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount,
        guestMessageLimit: GUEST_LIMIT,
      }),
    });

  } catch (topErr) {
    console.error("Unhandled chat error:", String(topErr));
    return json({ error: "Internal error: " + String(topErr) }, 500);
  }
});
