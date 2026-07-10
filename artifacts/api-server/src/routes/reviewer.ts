import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const runReviewer: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl("reviewer/run"));
};

const overrideCandidate: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl(`reviewer/${req.params.id}`));
};

router.post("/reviewer/run", runReviewer);
router.patch("/reviewer/:id", overrideCandidate);

export default router;
