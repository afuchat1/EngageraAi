import { Router, Request, Response } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("conversations");

router.get("/conversations", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, BASE);
});

router.delete("/conversations/:id", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}`);
});

router.get("/conversations/:id/messages", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}/messages`);
});

export default router;
