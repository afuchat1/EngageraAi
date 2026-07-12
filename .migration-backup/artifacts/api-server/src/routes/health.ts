import { Router } from "express";
import type { RequestHandler } from "express";

const router = Router();

const healthz: RequestHandler = (_req, res) => {
  res.json({ status: "ok" });
};

router.get("/healthz", healthz);

export default router;
