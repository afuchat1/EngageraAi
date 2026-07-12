const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-guest-session-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const MODELS = [
  {
    id: "engagera-2.0",
    name: "Engagera 2.0",
    description: "Primary model — full knowledge, fast, reliable for everyday tasks",
    category: "primary",
    contextWindow: 200000,
    available: true,
  },
  {
    id: "engagera-2.1",
    name: "Engagera 2.1",
    description: "Latest model — advanced reasoning, vision, and image generation",
    category: "latest",
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
