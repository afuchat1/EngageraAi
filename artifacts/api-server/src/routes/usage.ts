import { Router } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("usage");

router.get("/usage/summary", async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/summary`);
});

router.get("/usage", async (req, res) => {
  const days = req.query.days ? `?days=${req.query.days}` : "";
  await proxyToEdge(req, res, `${BASE}${days}`);
});

export default router;
