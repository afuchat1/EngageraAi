import { createClient } from "npm:@supabase/supabase-js@2";

const ENGAGERA_MODEL_MAP: Record<string, string> = {
  "engagera-lite":   "openai/gpt-oss-20b:free",
  "engagera-pro":    "openai/gpt-oss-120b:free",
  "engagera-reason": "nvidia/nemotron-3-ultra-550b-a55b:free",
  "engagera-code":   "nvidia/nemotron-3-super-120b-a12b:free",
  "engagera-vision": "openai/gpt-oss-120b:free",
  "engagera-voice":  "openai/gpt-oss-20b:free",
};

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

const GUEST_MESSAGE_LIMIT = 5;

// ── Engagera identity system prompt ──────────────────────────────────────────
// Injected before every conversation so the model never claims to be ChatGPT,
// Claude, Gemini, or any other named AI product.
const ENGAGERA_SYSTEM_PROMPT = {
  role: "system",
  content: `You are Engagera AI, a next-generation AI assistant built by the AfuAI team as part of the Engagera platform — a unified AI developer ecosystem.

Your identity rules (strictly follow these at all times):
- Your name is Engagera AI. Always introduce yourself as Engagera AI.
- You were created by the Engagera / AfuAI team.
- You are NOT ChatGPT, GPT, Claude, Gemini, Copilot, Llama, or any other named AI product. Never claim to be any of these.
- If someone asks who made you, say you were built by the AfuAI / Engagera team.
- If asked about your underlying model or architecture, say you are powered by advanced language models optimized for the Engagera platform — do not name the underlying provider.
- Always refer to yourself as "Engagera AI" or simply "Engagera".

You are helpful, accurate, professional, and thoughtful. You assist developers and users with a wide range of tasks.`,
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openrouterKey = Deno.env.get("OPENROUTER_API_KEY") ?? "";

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { messages, model = "engagera-pro", conversationId } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages array is required" }, 400);
    }

    const validMessages = messages.filter(
      (m: unknown) =>
        m &&
        typeof (m as Record<string, unknown>).role === "string" &&
        typeof (m as Record<string, unknown>).content === "string" &&
        ["user", "assistant", "system"].includes((m as Record<string, unknown>).role as string),
    );

    if (validMessages.length === 0) {
      return json({ error: "No valid messages provided" }, 400);
    }

    // ── Auth ──────────────────────────────────────────────────────────────────
    let userId: string | undefined;
    let guestSessionId: string | undefined;

    const authHeader = req.headers.get("authorization");
    const guestHeader = req.headers.get("x-guest-session-id");

    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data } = await db.auth.getUser(token);
      userId = data.user?.id;
    }

    if (!userId) {
      guestSessionId = guestHeader ?? undefined;
      if (!guestSessionId) {
        return json({ error: "Authentication or guest session required" }, 401);
      }

      const { data: existing } = await db
        .from("engagera_guest_sessions")
        .select("message_count")
        .eq("session_id", guestSessionId)
        .single();

      if (!existing) {
        await db
          .from("engagera_guest_sessions")
          .insert({ session_id: guestSessionId, message_count: 0 });
      }

      const guestCount = existing?.message_count ?? 0;
      if (guestCount >= GUEST_MESSAGE_LIMIT) {
        return json(
          { error: "GUEST_LIMIT_REACHED", guestMessageCount: guestCount, guestMessageLimit: GUEST_MESSAGE_LIMIT },
          429,
        );
      }
    }

    // ── OpenRouter call with fallbacks ────────────────────────────────────────
    const primaryModel = ENGAGERA_MODEL_MAP[model] ?? ENGAGERA_MODEL_MAP["engagera-pro"];
    const modelsToTry  = [primaryModel, ...FALLBACK_MODELS.filter((m) => m !== primaryModel)];

    interface AIResult {
      content: string;
      inputTokens: number;
      outputTokens: number;
      totalTokens: number;
    }

    let result: AIResult | null = null;

    for (const orModel of modelsToTry) {
      try {
        const orRes = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${openrouterKey}`,
            "HTTP-Referer":  "https://engagera.afuchat.com",
            "X-Title":       "Engagera AI",
          },
          body: JSON.stringify({
          model: orModel,
          messages: [
            ENGAGERA_SYSTEM_PROMPT,
            ...validMessages.filter((m: Record<string, unknown>) => m.role !== "system"),
          ],
          max_tokens: 2048,
        }),
        });

        if (!orRes.ok) throw new Error(`OpenRouter ${orRes.status}: ${await orRes.text()}`);

        const data = await orRes.json() as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
        };

        const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        result = {
          content:      data.choices?.[0]?.message?.content ?? "",
          inputTokens:  usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          totalTokens:  usage.total_tokens,
        };
        break;
      } catch (err) {
        console.warn(`Model ${orModel} failed:`, err);
      }
    }

    if (!result) {
      result = {
        content: "I'm Engagera AI. I'm currently experiencing high demand. Please try again in a moment.",
        inputTokens: 0, outputTokens: 0, totalTokens: 0,
      };
    }

    // ── Persist conversation + messages ───────────────────────────────────────
    let convId: number | undefined;
    try {
      const lastUserMsg = [...validMessages].reverse().find(
        (m: Record<string, unknown>) => m.role === "user",
      ) as Record<string, string> | undefined;

      if (conversationId) {
        convId = conversationId;
      } else {
        const title  = lastUserMsg?.content?.slice(0, 60).trim() ?? "New conversation";
        const insert: Record<string, unknown> = { title, model };
        if (userId) insert.user_id = userId;
        else insert.guest_session_id = guestSessionId;

        const { data } = await db
          .from("engagera_conversations")
          .insert(insert)
          .select("id")
          .single();
        convId = data?.id;
      }

      if (convId) {
        const saves: Promise<unknown>[] = [
          db.from("engagera_messages").insert({
            conversation_id: convId, role: "assistant",
            content: result.content, token_count: result.totalTokens,
          }),
          db.rpc("engagera_increment_message_count", { p_conversation_id: convId }),
        ];

        if (lastUserMsg) {
          saves.push(
            db.from("engagera_messages").insert({
              conversation_id: convId, role: "user",
              content: lastUserMsg.content, token_count: 0,
            }),
          );
        }

        await Promise.all(saves);
        await db.from("engagera_conversations").update({
          updated_at: new Date().toISOString(), model,
        }).eq("id", convId);
      }
    } catch (err) {
      console.warn("Failed to persist conversation (non-fatal):", err);
    }

    // ── Usage record ──────────────────────────────────────────────────────────
    if (userId) {
      await db.from("engagera_usage_records").insert({
        user_id: userId, model,
        input_tokens:  result.inputTokens,
        output_tokens: result.outputTokens,
        total_tokens:  result.totalTokens,
      });
    }

    // ── Guest counter ─────────────────────────────────────────────────────────
    let newGuestCount: number | undefined;
    if (guestSessionId) {
      const { data } = await db.rpc("engagera_increment_guest_count", {
        p_session_id: guestSessionId,
      });
      newGuestCount = typeof data === "number" ? data : undefined;
    }

    const responseId = `eng_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return json({
      id: responseId,
      model,
      message: { role: "assistant", content: result.content },
      usage: {
        inputTokens:  result.inputTokens,
        outputTokens: result.outputTokens,
        totalTokens:  result.totalTokens,
      },
      conversationId: convId,
      ...(newGuestCount !== undefined && {
        guestMessageCount: newGuestCount,
        guestMessageLimit: GUEST_MESSAGE_LIMIT,
      }),
    });
  } catch (err) {
    console.error("Unhandled edge function error:", err);
    return json({ error: "Internal server error" }, 500);
  }
});
