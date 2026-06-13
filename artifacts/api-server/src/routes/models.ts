import { Router, Request, Response } from "express";
import { edgeFnUrl, proxyToEdge } from "../lib/proxy.js";

const router = Router();

router.get("/models", async (req: Request, res: Response) => {
  await proxyToEdge(req, res, edgeFnUrl("models"));
});

export default router;
