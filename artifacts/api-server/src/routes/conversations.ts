import { Router } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("conversations");

router.get("/conversations", async (req, res) => {
  await proxyToEdge(req, res, BASE);
});

router.delete("/conversations/:id", async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}`);
});

router.get("/conversations/:id/messages", async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}/messages`);
});

export default router;
