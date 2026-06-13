import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const getDashboardStats: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl("dashboard"));
};

router.get("/dashboard/stats", getDashboardStats);

export default router;
