import { Router } from "express";
import healthRouter from "./health.js";
import modelsRouter from "./models.js";
import apiKeysRouter from "./apiKeys.js";
import usageRouter from "./usage.js";
import dashboardRouter from "./dashboard.js";
import chatRouter from "./chat.js";
import conversationsRouter from "./conversations.js";
import sttRouter from "./stt.js";

const router = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(apiKeysRouter);
router.use(usageRouter);
router.use(dashboardRouter);
router.use(chatRouter);
router.use(conversationsRouter);
router.use(sttRouter);

export default router;
