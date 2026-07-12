import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const getModels: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl("models"));
};

router.get("/models", getModels);

export default router;
