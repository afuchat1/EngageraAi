import { Router } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

router.get("/dashboard/stats", async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl("dashboard"));
});

export default router;
