import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("api-keys");

const getApiKeys: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, BASE);
};

const createApiKey: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, BASE);
};

const deleteApiKey: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}`);
};

router.get("/api-keys", getApiKeys);
router.post("/api-keys", createApiKey);
router.delete("/api-keys/:id", deleteApiKey);

export default router;
