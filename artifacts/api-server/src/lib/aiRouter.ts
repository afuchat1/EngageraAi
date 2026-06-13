import { logger } from "./logger";

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
  "engagera-lite": { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct:free" },
  "engagera-pro": { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free" },
  "engagera-reason": { provider: "openrouter", model: "deepseek/deepseek-r1:free" },
  "engagera-code": { provider: "openrouter", model: "qwen/qwen-2.5-coder-32b-instruct:free" },
  "engagera-vision": { provider: "openrouter", model: "google/gemma-3-27b-it:free" },
  "engagera-voice": { provider: "openrouter", model: "meta-llama/llama-3.1-8b-instruct:free" },
};

const FALLBACK_MODELS = [
  "meta-llama/llama-3.1-8b-instruct:free",
  "google/gemma-3-12b-it:free",
  "mistralai/mistral-7b-instruct:free",
];

async function callOpenRouter(
  model: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
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

  const data = await res.json();
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

export async function routeChat(
  engageraModel: string,
  messages: ChatMessage[],
): Promise<ChatResult> {
  const mapped = ENGAGERA_MODEL_MAP[engageraModel] ?? ENGAGERA_MODEL_MAP["engagera-pro"];

  const modelsToTry = [mapped.model, ...FALLBACK_MODELS.filter((m) => m !== mapped.model)];

  for (const model of modelsToTry) {
    try {
      const result = await callOpenRouter(model, messages);
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
