import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import agentsRouter from "./agents/index.js";
import gatewayRouter from "./gateway/index.js";
import tickRouter from "./tick/index.js";
import eventsRouter from "./events/index.js";
import notesRouter from "./notes/index.js";
import webhooksRouter from "./webhooks/index.js";
import gangsRouter from "./gangs/index.js";
import gameProposalsRouter from "./gameProposals/index.js";
import planetsRouter from "./planets/index.js";
import tournamentsRouter from "./tournaments/index.js";
import blogsRouter from "./blogs/index.js";
import badgesRouter from "./badges/index.js";
import tttRouter from "./ttt/index.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(agentsRouter);
router.use(gatewayRouter);
router.use(tickRouter);
router.use(eventsRouter);
router.use(notesRouter);
router.use(webhooksRouter);
router.use(gangsRouter);
router.use(gameProposalsRouter);
router.use(planetsRouter);
router.use(tournamentsRouter);
router.use(blogsRouter);
router.use(badgesRouter);
router.use(tttRouter);

export default router;
