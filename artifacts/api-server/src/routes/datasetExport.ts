import { Router } from "express";
import type { RequestHandler } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

const exportDataset: RequestHandler = async (req, res) => {
  await proxyToEdge(req, res, edgeFnUrl("dataset-export"));
};

router.post("/dataset-export", exportDataset);

export default router;
