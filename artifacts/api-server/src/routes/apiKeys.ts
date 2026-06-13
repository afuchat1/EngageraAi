import { Router, Request, Response } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("api-keys");

router.get("/api-keys", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, BASE);
});

router.post("/api-keys", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, BASE);
});

router.delete("/api-keys/:id", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}`);
});

export default router;
