import { Router } from "express";
import healthRouter from "./health.js";
import modelsRouter from "./models.js";
import apiKeysRouter from "./apiKeys.js";
import usageRouter from "./usage.js";
import dashboardRouter from "./dashboard.js";
import chatRouter from "./chat.js";
import devChatRouter from "./devChat.js";
import conversationsRouter from "./conversations.js";
import sttRouter from "./stt.js";
import adminRouter from "./admin.js";
import reviewerRouter from "./reviewer.js";
import datasetExportRouter from "./datasetExport.js";

const router = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(apiKeysRouter);
router.use(usageRouter);
router.use(dashboardRouter);
router.use(chatRouter);
router.use(devChatRouter);
router.use(conversationsRouter);
router.use(sttRouter);
router.use(adminRouter);
router.use(reviewerRouter);
router.use(datasetExportRouter);

export default router;
