import express from "express";
import cors from "cors";
import type { Options as PinoHttpOptions } from "pino-http";
import path from "path";
import router from "./routes/index.js";
import { logger } from "./lib/logger.js";

// pino-http ships as CJS; handle the ESM default-import interop at runtime
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pinoHttp: (opts: PinoHttpOptions) => express.RequestHandler =
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (await import("pino-http").then((m) => m.default ?? m)) as any;

const app = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req: { id: unknown; method: unknown; url?: string }) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res: { statusCode: unknown }) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── API routes — always registered first ─────────────────────────────────────
app.use("/api", router);

// ── Production: serve the built React frontend from Express ───────────────────
// In development, the Vite dev server (port 5173) handles the frontend.
// In production, Express serves the built static assets AND the API from a
// single port so no cross-origin / proxy configuration is needed.
//
// The esbuild banner in build.mjs injects __dirname as the bundle's directory:
//   artifacts/api-server/dist/
// The React build output lives at:
//   artifacts/engagera/dist/public/
// Relative path: ../../engagera/dist/public
// On Vercel, static files are served from the CDN separately — Express only
// handles /api/* routes. Skip static serving when VERCEL env var is set.
if (process.env.NODE_ENV === "production" && !process.env.VERCEL) {
  const frontendDist = path.join(__dirname, "../../engagera/dist/public");

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(frontendDist));

  // SPA fallback — any non-/api route serves index.html so client-side routing works
  // Cast res to any: @types/express v5 narrowed sendFile's signature but it exists at runtime
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("*", (_req: express.Request, res: any) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
