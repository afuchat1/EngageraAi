const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-engagera-api-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MODELS = [
  {
    id: "engagera-lite",
    name: "Engagera Lite",
    description: "Fast answers for everyday questions and lightweight tasks",
    category: "fast",
    contextWindow: 128000,
    available: true,
  },
  {
    id: "engagera-pro",
    name: "Engagera Pro",
    description: "Best all-around model for research, writing, and complex tasks",
    category: "general",
    contextWindow: 200000,
    available: true,
  },
  {
    id: "engagera-reason",
    name: "Engagera Reason",
    description: "Deep reasoning for analysis, planning, and difficult decisions",
    category: "reasoning",
    contextWindow: 200000,
    available: true,
  },
  {
    id: "engagera-code",
    name: "Engagera Code",
    description: "Production-focused software engineering and debugging",
    category: "code",
    contextWindow: 200000,
    available: true,
  },
  {
    id: "engagera-vision",
    name: "Engagera Vision",
    description: "Understand images, screenshots, documents, and visual context",
    category: "vision",
    contextWindow: 128000,
    available: true,
  },
  {
    id: "engagera-image",
    name: "Engagera Image",
    description: "Generate and edit branded visual content",
    category: "image",
    contextWindow: 128000,
    available: true,
  },
];

Deno.serve((req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }
  return new Response(JSON.stringify(MODELS), {
    status: 200,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
