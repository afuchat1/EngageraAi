import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
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
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "../../engagera/dist/public");

  // Serve static assets (JS, CSS, images, etc.)
  app.use(express.static(frontendDist));

  // SPA fallback — any non-/api route serves index.html so client-side routing works
  app.get("*", (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

export default app;
