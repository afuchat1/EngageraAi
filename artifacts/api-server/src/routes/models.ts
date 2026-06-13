import { Router } from "express";
import { getEngageraModels } from "../lib/aiRouter.js";

const router = Router();

router.get("/models", (_req, res) => {
  res.json(getEngageraModels());
});

export default router;
