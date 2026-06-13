import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL_MAP: Record<string, string> = {
  "engagera-lite":   "openai/gpt-4o-mini",
  "engagera-pro":    "openai/gpt-4o",
  "engagera-reason": "anthropic/claude-opus-4-5",
  "engagera-code":   "anthropic/claude-sonnet-4-5",
  "engagera-vision": "openai/gpt-4o",
  "engagera-voice":  "openai/gpt-4o-mini",
};
const DEFAULT_MODEL = "openai/gpt-4o-mini";

const GUEST_LIMIT = 5;
const WINDOW_MS = 24 * 60 * 60 * 1000;

const SYSTEM_PROMPT = `You are Engagera, a helpful AI assistant built by the AfuAI / Engagera team.

Identity rules:
- You were built by the AfuAI / Engagera team. Do NOT claim to be ChatGPT, Claude, Gemini, or any other named AI.
- If asked who made you, say you were built by the AfuAI / Engagera team.
- If asked about your underlying model, say you are powered by advanced language models optimized for the Engagera platform.
- Only state your name if directly asked. In normal conversation just respond helpfully.

Style:
- Be concise, helpful, and accurate. Adapt tone to the user.
- Use markdown for code (always include the language tag), lists, and structured content.
- If unsure about something, say so rather than guessing.`;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const orKey       = Deno.env.get("OPENROUTER_API_KEY") ?? "";

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const { messages, model = "engagera-lite", conversationId, contextHint } = body as {
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
    const { data } = await db.auth.getUser(authHeader.slice(7));
    userId = data.user?.id;
  }

  if (!userId) {
    guestSessionId = req.headers.get("x-guest-session-id") ?? undefined;
    if (!guestSessionId) return json({ error: "Authentication or guest session required" }, 401);

    // ── Guest rate limiting ───────────────────────────────────────────────
    const now = new Date();
    const { data: session } = await db
      .from("engagera_guest_sessions")
      .select("message_count, window_start")
      .eq("session_id", guestSessionId)
      .single();

    if (!session) {
      await db.from("engagera_guest_sessions").insert({
        session_id: guestSessionId, message_count: 0,
        window_start: now.toISOString(), last_seen_at: now.toISOString(),
      });
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

  // ── Call OpenRouter ───────────────────────────────────────────────────────
  const orModel = MODEL_MAP[model] ?? DEFAULT_MODEL;

  const systemContent = contextHint
    ? `${SYSTEM_PROMPT}\n\n[User context] ${contextHint}`
    : SYSTEM_PROMPT;

  const orMessages = [
    { role: "system", content: systemContent },
    ...validMessages
      .filter((m) => m.role !== "system")
      .map((m) => ({ role: m.role, content: m.content })),
  ];

  const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${orKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://engagera.afuchat.com",
      "X-Title": "Engagera AI",
    },
    body: JSON.stringify({ model: orModel, messages: orMessages, max_tokens: 4096 }),
  });

  if (!orRes.ok) {
    console.error("OpenRouter error:", await orRes.text());
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
      const saves: Promise<unknown>[] = [
        db.from("engagera_messages").insert({
          conversation_id: convId, role: "assistant",
          content: reply, token_count: usage.total_tokens,
        }),
        db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
      ];
      if (lastUser) {
        const userText = typeof lastUser.content === "string"
          ? lastUser.content
          : JSON.stringify(lastUser.content);
        saves.push(db.from("engagera_messages").insert({
          conversation_id: convId, role: "user", content: userText, token_count: 0,
        }));
      }
      await Promise.all(saves);
    }
  } catch (err) {
    console.warn("Conversation persist failed (non-fatal):", err);
  }

  // ── Usage record ──────────────────────────────────────────────────────────
  if (userId) {
    await db.from("engagera_usage_records").insert({
      user_id: userId, model,
      input_tokens: usage.prompt_tokens,
      output_tokens: usage.completion_tokens,
      total_tokens: usage.total_tokens,
    }).catch(() => {});
  }

  // ── Guest counter ─────────────────────────────────────────────────────────
  let newGuestCount: number | undefined;
  if (guestSessionId) {
    const { data } = await db.rpc("engagera_increment_guest_count", {
      p_session_id: guestSessionId,
    }).catch(() => ({ data: undefined }));
    newGuestCount = typeof data === "number" ? data : undefined;
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
});
