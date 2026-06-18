/**
 * Vercel Serverless Function — lightweight proxy to Supabase Edge Functions.
 *
 * Replaces the heavy Express + pino import that caused FUNCTION_INVOCATION_FAILED
 * in production (pino uses worker threads which Vercel's bundler cannot resolve).
 *
 * All /api/* routes are forwarded to the matching Supabase Edge Function.
 * Auth headers (Authorization, x-guest-session-id) are passed through verbatim.
 */

export const config = {
  api: {
    bodyParser: false,
  },
};

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? "https://rhnsjqqtdzlkvqazfcbg.supabase.co";

function edgeFnUrl(slug: string): string {
  return `${SUPABASE_URL}/functions/v1/${slug}`;
}

function forwardHeaders(req: any): Record<string, string> {
  const h: Record<string, string> = {};
  const auth = req.headers["authorization"];
  if (typeof auth === "string") h["authorization"] = auth;
  const guest = req.headers["x-guest-session-id"];
  if (typeof guest === "string" && guest) h["x-guest-session-id"] = guest;
  return h;
}

function readRawBody(req: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function proxy(
  req: any,
  res: any,
  targetUrl: string,
  overrideBody?: unknown,
): Promise<void> {
  const method: string = req.method ?? "GET";
  const fh = forwardHeaders(req);

  let body: string | undefined;
  if (!["GET", "HEAD"].includes(method)) {
    fh["content-type"] = "application/json";
    body = JSON.stringify(overrideBody ?? {});
  }

  const upstream = await fetch(targetUrl, { method, headers: fh, body });

  const ct = upstream.headers.get("content-type") ?? "";
  if (ct.startsWith("audio/")) {
    const buf = await upstream.arrayBuffer();
    res.setHeader("content-type", ct);
    res.status(upstream.status).send(Buffer.from(buf));
    return;
  }

  const data = await upstream.json().catch(() => ({}));
  res.status(upstream.status).json(data);
}

export default async function handler(req: any, res: any): Promise<void> {
  const method: string = req.method ?? "GET";
  const rawUrl: string = req.url ?? "/";
  const path = rawUrl.replace(/^\/api/, "").split("?")[0];
  const qs = rawUrl.includes("?") ? rawUrl.slice(rawUrl.indexOf("?")) : "";

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, x-guest-session-id",
  );

  if (method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // ── Health ────────────────────────────────────────────────────────────────
  if (path === "/healthz" || path === "/health") {
    res.json({ status: "ok" });
    return;
  }

  // ── Models ────────────────────────────────────────────────────────────────
  if (path === "/models" && method === "GET") {
    await proxy(req, res, edgeFnUrl("models"));
    return;
  }

  // ── API Keys ──────────────────────────────────────────────────────────────
  if (path === "/api-keys" && method === "GET") {
    await proxy(req, res, edgeFnUrl("api-keys"));
    return;
  }
  if (path === "/api-keys" && method === "POST") {
    const raw = await readRawBody(req);
    const parsed = JSON.parse(raw.toString() || "{}");
    await proxy(req, res, edgeFnUrl("api-keys"), parsed);
    return;
  }
  const keyDel = path.match(/^\/api-keys\/(\d+)$/);
  if (keyDel && method === "DELETE") {
    await proxy(req, res, `${edgeFnUrl("api-keys")}/${keyDel[1]}`);
    return;
  }

  // ── Usage ─────────────────────────────────────────────────────────────────
  if (path === "/usage/summary" && method === "GET") {
    await proxy(req, res, `${edgeFnUrl("usage")}/summary`);
    return;
  }
  if (path === "/usage" && method === "GET") {
    await proxy(req, res, `${edgeFnUrl("usage")}${qs}`);
    return;
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────
  if (path === "/dashboard/stats" && method === "GET") {
    await proxy(req, res, edgeFnUrl("dashboard"));
    return;
  }

  // ── Chat ──────────────────────────────────────────────────────────────────
  if (path === "/chat" && method === "POST") {
    const raw = await readRawBody(req);
    const parsed = JSON.parse(raw.toString() || "{}");
    await proxy(req, res, edgeFnUrl("chat"), parsed);
    return;
  }

  // ── Conversations ─────────────────────────────────────────────────────────
  if (path === "/conversations" && method === "GET") {
    await proxy(req, res, edgeFnUrl("conversations"));
    return;
  }
  const convMsg = path.match(/^\/conversations\/(\d+)\/messages$/);
  if (convMsg && method === "GET") {
    await proxy(
      req,
      res,
      `${edgeFnUrl("conversations")}/${convMsg[1]}/messages`,
    );
    return;
  }
  const convItem = path.match(/^\/conversations\/(\d+)$/);
  if (convItem) {
    await proxy(req, res, `${edgeFnUrl("conversations")}/${convItem[1]}`);
    return;
  }

  // ── STT ───────────────────────────────────────────────────────────────────
  if (path === "/stt" && method === "POST") {
    const raw = await readRawBody(req);
    const ct =
      typeof req.headers["content-type"] === "string"
        ? req.headers["content-type"]
        : "audio/webm";
    const fh = forwardHeaders(req);
    fh["content-type"] = ct;
    const upstream = await fetch(edgeFnUrl("stt"), {
      method: "POST",
      headers: fh,
      body: new Uint8Array(raw),
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
    return;
  }

  res.status(404).json({ error: "Not found" });
}
