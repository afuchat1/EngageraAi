import { cors, json } from "../_shared/helpers.ts";

const MODELS = [
  { id: "engagera-lite",   name: "Engagera Lite",   description: "Fast and efficient for simple tasks",      category: "lite",   contextWindow: 128000, available: true },
  { id: "engagera-pro",    name: "Engagera Pro",    description: "Balanced intelligence for everyday tasks", category: "pro",    contextWindow: 128000, available: true },
  { id: "engagera-reason", name: "Engagera Reason", description: "Deep reasoning for complex problems",      category: "reason", contextWindow: 64000,  available: true },
  { id: "engagera-code",   name: "Engagera Code",   description: "Specialized for programming tasks",        category: "code",   contextWindow: 128000, available: true },
  { id: "engagera-vision", name: "Engagera Vision", description: "Image understanding and analysis",         category: "vision", contextWindow: 64000,  available: true },
  { id: "engagera-voice",  name: "Engagera Voice",  description: "Optimized for speech and audio tasks",     category: "voice",  contextWindow: 32000,  available: true },
  { id: "engagera-image",  name: "Engagera Image",  description: "Generate images from text descriptions",   category: "vision", contextWindow: 0,      available: true },
];

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") return cors();
  return json(MODELS);
});
