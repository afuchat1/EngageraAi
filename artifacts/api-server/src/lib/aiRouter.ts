import { logger } from "./logger.js";
import { supabaseAdmin } from "./supabase.js";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ChatResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  internalModel: string;
}

const ENGAGERA_MODEL_MAP: Record<string, { provider: string; model: string }> = {
  "engagera-lite":   { provider: "openrouter", model: "openai/gpt-oss-20b:free" },
  "engagera-pro":    { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
  "engagera-reason": { provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  "engagera-code":   { provider: "openrouter", model: "nvidia/nemotron-3-super-120b-a12b:free" },
  "engagera-vision": { provider: "openrouter", model: "openai/gpt-oss-120b:free" },
  "engagera-voice":  { provider: "openrouter", model: "openai/gpt-oss-20b:free" },
};

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b:free",
  "openai/gpt-oss-20b:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
];

// ── API key resolution ────────────────────────────────────────────────────────
// Primary source: Supabase Vault (key stored there, NOT in Replit env).
// Fallback:       process.env.OPENROUTER_API_KEY (local dev only).
// Result is cached in memory for the lifetime of the process.
let _cachedApiKey: string | null = null;

async function getOpenRouterApiKey(): Promise<string | null> {
  if (_cachedApiKey !== null) return _cachedApiKey;

  // 1. Supabase Vault via public wrapper RPC
  //    Requires: supabase/migrations/20250101000000_engagera_get_secret.sql applied
  try {
    const { data, error } = await supabaseAdmin.rpc("engagera_get_secret", {
      secret_name: "OPENROUTER_API_KEY",
    });

    if (!error && typeof data === "string" && data.length > 0) {
      _cachedApiKey = data;
      logger.info("OpenRouter API key loaded from Supabase Vault");
      return _cachedApiKey;
    }
    if (error) logger.warn({ err: error }, "Vault RPC error — trying env fallback");
  } catch (err) {
    logger.warn({ err }, "Could not reach Supabase Vault — trying env fallback");
  }

  // 2. Environment variable (local dev fallback only)
  const envKey = process.env["OPENROUTER_API_KEY"] ?? null;
  if (envKey) {
    _cachedApiKey = envKey;
    logger.info("OpenRouter API key loaded from environment (dev fallback)");
    return _cachedApiKey;
  }

  logger.error(
    "OPENROUTER_API_KEY not found. Add it via: Supabase Dashboard → Database → Vault → New secret (name: OPENROUTER_API_KEY)"
  );
  return null;
}

async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const apiKey = await getOpenRouterApiKey();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "HTTP-Referer": "https://engagera.afuchat.com",
    "X-Title": "Engagera AI",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({ model, messages, max_tokens: 2048 }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenRouter error ${res.status}: ${err}`);
  }

  const data = await res.json() as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  };
  const choice = data.choices?.[0];
  const usage = data.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

  return {
    content: choice?.message?.content ?? "",
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    totalTokens: usage.total_tokens,
    internalModel: model,
  };
}

// ── Engagera AI system prompt ─────────────────────────────────────────────────
// Injected at the start of every conversation so the model never claims to be
// ChatGPT, Claude, Gemini, or any other named AI product.
const ENGAGERA_SYSTEM_PROMPT: ChatMessage = {
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

/**
 * Prepend the Engagera system prompt if the messages array does not already
 * contain a system message. This ensures identity is always established.
 */
function withSystemPrompt(messages: ChatMessage[]): ChatMessage[] {
  const hasSystem = messages.some((m) => m.role === "system");
  return hasSystem ? messages : [ENGAGERA_SYSTEM_PROMPT, ...messages];
}

export async function routeChat(
  engageraModel: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const mapped = ENGAGERA_MODEL_MAP[engageraModel] ?? ENGAGERA_MODEL_MAP["engagera-pro"];
  const messagesWithPrompt = withSystemPrompt(messages);

  const modelsToTry = [mapped.model, ...FALLBACK_MODELS.filter((m) => m !== mapped.model)];

  for (const model of modelsToTry) {
    try {
      const result = await callOpenRouter(model, messagesWithPrompt);
      logger.info({ engageraModel, internalModel: model }, "AI request routed");
      return result;
    } catch (err) {
      logger.warn({ model, err }, "Model failed, trying fallback");
    }
  }

  return {
    content:
      "I'm Engagera AI. I'm currently experiencing high demand. Please try again in a moment.",
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    internalModel: "fallback",
  };
}

export function getEngageraModels() {
  return [
    {
      id: "engagera-lite",
      name: "Engagera Lite",
      description: "Fast and efficient for simple tasks",
      category: "lite",
      contextWindow: 128000,
      available: true,
    },
    {
      id: "engagera-pro",
      name: "Engagera Pro",
      description: "Balanced intelligence for everyday tasks",
      category: "pro",
      contextWindow: 128000,
      available: true,
    },
    {
      id: "engagera-reason",
      name: "Engagera Reason",
      description: "Deep reasoning for complex problems",
      category: "reason",
      contextWindow: 64000,
      available: true,
    },
    {
      id: "engagera-code",
      name: "Engagera Code",
      description: "Specialized for programming tasks",
      category: "code",
      contextWindow: 128000,
      available: true,
    },
    {
      id: "engagera-vision",
      name: "Engagera Vision",
      description: "Image understanding and analysis",
      category: "vision",
      contextWindow: 64000,
      available: true,
    },
    {
      id: "engagera-voice",
      name: "Engagera Voice",
      description: "Optimized for speech and audio tasks",
      category: "voice",
      contextWindow: 32000,
      available: true,
    },
  ];
}
