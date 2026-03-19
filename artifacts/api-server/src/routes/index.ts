import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import agentsRouter from "./agents/index.js";
import gatewayRouter from "./gateway/index.js";
import tickRouter from "./tick/index.js";
import eventsRouter from "./events/index.js";
import notesRouter from "./notes/index.js";
import webhooksRouter from "./webhooks/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(gatewayRouter);
router.use(tickRouter);
router.use(eventsRouter);
router.use(notesRouter);
router.use(webhooksRouter);

export default router;
