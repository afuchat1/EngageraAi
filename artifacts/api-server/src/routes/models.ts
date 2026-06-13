import { Router } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

router.get("/models", async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl("models"));
});

export default router;
