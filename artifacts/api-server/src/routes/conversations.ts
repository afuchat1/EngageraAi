import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const BASE = edgeFnUrl("conversations");

const getConversations: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, BASE);
};

const deleteConversation: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}`);
};

const getMessages: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, `${BASE}/${req.params.id}/messages`);
};

router.get("/conversations", getConversations);
router.delete("/conversations/:id", deleteConversation);
router.get("/conversations/:id/messages", getMessages);

export default router;
