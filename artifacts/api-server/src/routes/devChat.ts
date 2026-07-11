/**
 * Engagera Dev Chat route
 *
 * Handles chat completions using the Engagera Dev system prompt directly
 * in the Express server, calling OpenRouter (or Groq as fallback).
 * API keys never leave the server — they are read from environment variables.
 */
import { Router } from "express";
import type { RequestHandler } from "express";
import { ENGAGERA_DEV_SYSTEM_PROMPT } from "../lib/engageraDevPrompt.js";

const router = Router();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type MessageRole = "user" | "assistant" | "system";

interface ChatMessage {
  role: MessageRole;
  content: string;
}

interface ProviderResult {
  ok: boolean;
  content: string;
  inputTokens: number;
  outputTokens: number;
  provider?: string;
  model?: string;
  error?: string;
}

async function callOpenAICompat(
  url: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  providerName: string,
  extraHeaders?: Record<string, string>,
): Promise<ProviderResult> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...extraHeaders,
      },
      body: JSON.stringify({ model, messages, max_tokens: 8192 }),
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      return {
        ok: false,
        content: "",
        inputTokens: 0,
        outputTokens: 0,
        error: `${providerName} HTTP ${res.status}: ${errText.slice(0, 120)}`,
      };
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };

    if (data.error) {
      return {
        ok: false,
        content: "",
        inputTokens: 0,
        outputTokens: 0,
        error: data.error.message,
      };
    }

    const content = data.choices?.[0]?.message?.content ?? "";
    if (!content) {
      return {
        ok: false,
        content: "",
        inputTokens: 0,
        outputTokens: 0,
        error: "empty response",
      };
    }

    return {
      ok: true,
      content,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      provider: providerName,
      model,
    };
  } catch (err) {
    return {
      ok: false,
      content: "",
      inputTokens: 0,
      outputTokens: 0,
      error: String(err),
    };
  }
}

async function callWithFallback(messages: ChatMessage[]): Promise<ProviderResult> {
  const orKey = process.env.OPENROUTER_API_KEY ?? "";
  const groqKey = process.env.GROQ_API_KEY ?? "";
  const openaiKey = process.env.OPENAI_API_KEY ?? "";

  const providers: Array<() => Promise<ProviderResult>> = [];

  if (groqKey) {
    providers.push(() =>
      callOpenAICompat(GROQ_URL, groqKey, "llama-3.3-70b-versatile", messages, "groq"),
    );
    providers.push(() =>
      callOpenAICompat(GROQ_URL, groqKey, "llama-3.1-8b-instant", messages, "groq-lite"),
    );
  }

  if (orKey) {
    providers.push(() =>
      callOpenAICompat(
        OPENROUTER_URL,
        orKey,
        "meta-llama/llama-3.3-70b-instruct",
        messages,
        "openrouter",
        {
          "HTTP-Referer": "https://engagera.afuchat.com",
          "X-Title": "Engagera Dev",
        },
      ),
    );
    providers.push(() =>
      callOpenAICompat(
        OPENROUTER_URL,
        orKey,
        "deepseek/deepseek-chat",
        messages,
        "openrouter-deepseek",
        {
          "HTTP-Referer": "https://engagera.afuchat.com",
          "X-Title": "Engagera Dev",
        },
      ),
    );
  }

  if (openaiKey) {
    providers.push(() =>
      callOpenAICompat(OPENAI_URL, openaiKey, "gpt-4o-mini", messages, "openai"),
    );
  }

  if (providers.length === 0) {
    return {
      ok: false,
      content: "",
      inputTokens: 0,
      outputTokens: 0,
      error: "No AI API keys configured. Add GROQ_API_KEY, OPENROUTER_API_KEY, or OPENAI_API_KEY.",
    };
  }

  const errors: string[] = [];
  for (const call of providers) {
    const result = await call();
    if (result.ok) return result;
    errors.push(result.error ?? "unknown error");
  }

  return {
    ok: false,
    content: "",
    inputTokens: 0,
    outputTokens: 0,
    error: `All providers failed: ${errors.join(" | ")}`,
  };
}

const devChatHandler: RequestHandler = async (req, res) => {
  const { messages } = req.body ?? {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages array is required" });
    return;
  }

  const validMessages: ChatMessage[] = messages
    .filter(
      (m: unknown) =>
        m &&
        typeof m === "object" &&
        ["user", "assistant"].includes((m as { role: string }).role) &&
        typeof (m as { content: string }).content === "string",
    )
    .map((m: { role: string; content: string }) => ({
      role: m.role as MessageRole,
      content: m.content,
    }));

  if (validMessages.length === 0) {
    res.status(400).json({ error: "No valid messages" });
    return;
  }

  const developerSystemMessage = validMessages.find((m) => m.role === "system");
  const systemPrompt = developerSystemMessage
    ? developerSystemMessage.content
    : ENGAGERA_DEV_SYSTEM_PROMPT;

  const thread: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    ...validMessages.filter((m) => m.role !== "system"),
  ];

  const result = await callWithFallback(thread);

  if (!result.ok) {
    res.status(502).json({ error: result.error ?? "AI service unavailable" });
    return;
  }

  res.json({
    id: `engdev_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    model: "engagera-dev",
    message: { role: "assistant", content: result.content },
    usage: {
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      totalTokens: result.inputTokens + result.outputTokens,
    },
    provider: result.provider,
    providerModel: result.model,
  });
};

router.post("/chat/dev", devChatHandler);

export default router;
