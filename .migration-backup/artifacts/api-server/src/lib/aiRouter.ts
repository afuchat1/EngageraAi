/**
 * AI router — model registry only.
 *
 * The actual AI completion is handled by the Supabase "chat" Edge Function
 * (supabase/functions/chat/index.ts) which holds OPENROUTER_API_KEY in its
 * Edge Function secrets. The Express server proxies chat requests to it so
 * the key never leaves Supabase's secure environment.
 *
 * This file exists solely to expose the public model catalogue used by
 * GET /api/models.
 */

export function getEngageraModels() {
  return [
    {
      id: "engagera-2.0",
      name: "Engagera 2.0",
      description: "Primary model — full world knowledge including code, reasoning, analysis, writing, math, and science",
      category: "primary",
      contextWindow: 200000,
      available: true,
    },
    {
      id: "engagera-2.1",
      name: "Engagera 2.1",
      description: "Latest model — everything in 2.0 plus image generation and vision analysis",
      category: "latest",
      contextWindow: 200000,
      available: true,
    },
  ];
}
