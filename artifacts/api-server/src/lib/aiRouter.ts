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
