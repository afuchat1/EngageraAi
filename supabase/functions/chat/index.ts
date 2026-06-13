import { createClient } from "npm:@supabase/supabase-js@2";

/**
 * Model map — Engagera public IDs → OpenRouter internal IDs
 *
 * engagera-2.0  Primary — full world knowledge, no image generation
 * engagera-2.1  Latest  — everything + image generation + vision
 *
 * Legacy IDs kept for backwards compatibility with older clients.
 */
const MODEL_MAP: Record<string, string> = {
  // Current public lineup
  "engagera-2.0":    "openai/gpt-4o",       // Primary — full knowledge, reliable
  "engagera-2.1":    "openai/gpt-4o",       // Latest — same model, image-gen enabled by logic
  // Legacy IDs — kept for backwards compatibility
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
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Keywords that trigger image generation mode (for engagera-2.1 / engagera-image)
const IMAGE_GEN_KEYWORDS = [
  "generate image", "create image", "draw ", "illustrate",
  "make a picture", "make an image", "design an image",
  "show me a picture", "generate a picture", "paint ",
  "sketch ", "render an image", "create a visual",
  "design a logo", "generate a logo", "make art",
  "create art", "show me art", "generate art",
  "create an illustration", "generate an illustration",
  "make me an image", "make me a picture", "draw me",
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
- Be thorough, accurate, and genuinely helpful.

Style:
- Be concise and helpful. Adapt tone to the user.
- Use markdown for code (always include the language tag), lists, and structured content.
- If unsure about something, say so rather than guessing.`;

const IMAGE_SYSTEM_PROMPT = `You are Engagera 2.1, an AI that creates beautiful, detailed SVG artwork.

When the user requests an image, illustration, picture, drawing, logo, or any visual:
- Respond with ONLY a single fenced code block using the \`\`\`svg language tag.
- The SVG must be self-contained, with width="512" height="512" viewBox="0 0 512 512".
- Make it detailed, colorful, and visually rich — use gradients, multiple shapes, depth, and artistry.
- Use <defs> with <linearGradient> or <radialGradient> where it adds visual quality.
- No external images or fonts. Pure SVG elements only (rect, circle, ellipse, path, polygon, text, g, defs, etc.).
- Include fine details: shadows, highlights, textures achieved with SVG shapes.
- Do NOT include any text outside the code block. Output ONLY the \`\`\`svg block.`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

type ContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
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
  return IMAGE_GEN_KEYWORDS.some((k) => text.includes(k));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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
      messages: unknown[];
      model?: string;
      conversationId?: number;
      contextHint?: string;
    };

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const validMessages = messages.filter(isValidMessage);
    if (validMessages.length === 0) return json({ error: "No valid messages" }, 400);

    // ── Auth ─────────────────────────────────────────────────────────────────
    let userId: string | undefined;
    let guestSessionId: string | undefined;

    const authHeader = req.headers.get("authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
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
          session_id: guestSessionId,
          message_count: 0,
          window_start: now.toISOString(),
          last_seen_at: now.toISOString(),
        });
        if (insertError) {
          console.error("Guest session insert error:", JSON.stringify(insertError));
          return json({ error: "Session create failed" }, 500);
        }
      } else {
        const windowAge = now.getTime() - new Date(session.window_start).getTime();
        if (windowAge >= WINDOW_MS) {
          await db.from("engagera_guest_sessions").update({
            message_count: 0, window_start: now.toISOString(), last_seen_at: now.toISOString(),
          }).eq("session_id", guestSessionId);
        } else if (session.message_count >= GUEST_LIMIT) {
          const resetAt = new Date(new Date(session.window_start).getTime() + WINDOW_MS);
          return json({
            error: "Daily message limit reached. Sign up for unlimited access.",
            windowResetAt: resetAt.toISOString(),
            guestMessageCount: session.message_count,
            guestMessageLimit: GUEST_LIMIT,
          }, 429);
        }
      }
    }

    // ── Determine if this is an image generation request ─────────────────────
    // engagera-image always generates images.
    // engagera-2.1 generates images only when the user asks for one.
    const isImageModel = model === "engagera-image";
    const is21ImageRequest = model === "engagera-2.1" && isImageGenRequest(validMessages);
    const generateImage = isImageModel || is21ImageRequest;

    // ── Select OpenRouter model ───────────────────────────────────────────────
    const orModel = MODEL_MAP[model] ?? DEFAULT_MODEL;

    // ── Build system prompt ───────────────────────────────────────────────────
    const systemContent = generateImage
      ? IMAGE_SYSTEM_PROMPT
      : contextHint
        ? `${SYSTEM_PROMPT}\n\n[User context] ${contextHint}`
        : SYSTEM_PROMPT;

    const orMessages = [
      { role: "system", content: systemContent },
      ...validMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content })),
    ];

    // ── Call OpenRouter ───────────────────────────────────────────────────────
    let orRes: Response;
    try {
      orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${orKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://engagera.afuchat.com",
          "X-Title": "Engagera AI",
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
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };
    const reply = orData.choices?.[0]?.message?.content ?? "";
    const usage = orData.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    // ── Persist conversation ───────────────────────────────────────────────────
    let convId: number | undefined = conversationId;
    try {
      const lastUser = [...validMessages].reverse().find((m) => m.role === "user");
      const textPreview = lastUser ? getTextPreview(lastUser.content) : "";

      if (!convId) {
        const insert: Record<string, unknown> = {
          title: textPreview.slice(0, 60) || "New conversation",
          model,
        };
        if (userId) insert.user_id = userId;
        else insert.guest_session_id = guestSessionId;

        const { data } = await db.from("engagera_conversations").insert(insert).select("id").single();
        convId = data?.id;
      } else {
        await db.from("engagera_conversations")
          .update({ updated_at: new Date().toISOString(), model })
          .eq("id", convId);
      }

      if (convId) {
        const msgSaves = [
          db.from("engagera_messages").insert({
            conversation_id: convId, role: "assistant",
            content: reply, token_count: usage.total_tokens,
          }),
          db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
        ];
        const lastUser2 = [...validMessages].reverse().find((m) => m.role === "user");
        if (lastUser2) {
          const userText = typeof lastUser2.content === "string"
            ? lastUser2.content
            : JSON.stringify(lastUser2.content);
          msgSaves.push(db.from("engagera_messages").insert({
            conversation_id: convId, role: "user", content: userText, token_count: 0,
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
          user_id: userId, model,
          input_tokens: usage.prompt_tokens,
          output_tokens: usage.completion_tokens,
          total_tokens: usage.total_tokens,
        });
      } catch (e) {
        console.warn("Usage record failed:", String(e));
      }
    }

    // ── Guest counter ─────────────────────────────────────────────────────────
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
      id: `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
