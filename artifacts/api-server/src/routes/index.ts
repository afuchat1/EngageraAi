import { Router, type IRouter } from "express";
import healthRouter from "./health";
import modelsRouter from "./models";
import apiKeysRouter from "./apiKeys";
import usageRouter from "./usage";
import dashboardRouter from "./dashboard";
import chatRouter from "./chat";

const router: IRouter = Router();

router.use(healthRouter);
router.use(modelsRouter);
router.use(apiKeysRouter);
router.use(usageRouter);
router.use(dashboardRouter);
router.use(chatRouter);

export default router;
