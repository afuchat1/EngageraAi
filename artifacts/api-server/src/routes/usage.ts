import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("usage");

const getUsageSummary: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/summary`);
};

const getUsage: RequestHandler = async (req, res) => {
  const days = req.query.days ? `?days=${req.query.days}` : "";
  await proxyToEdge(req, res, `${BASE}${days}`);
};

router.get("/usage/summary", getUsageSummary);
router.get("/usage", getUsage);

export default router;
