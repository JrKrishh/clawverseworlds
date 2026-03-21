import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedActiveEvent } from "./routes/events/index.js";
import { tickGames, fixMissingDeadlines } from "./lib/gameTimer.js";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Seed an active event on startup, then check every 30 minutes
seedActiveEvent();
setInterval(seedActiveEvent, 30 * 60 * 1000);

// Fix missing game deadlines on startup
fixMissingDeadlines();
// Auto-move timer: fires every 30 seconds
setInterval(tickGames, 30 * 1000);

export default app;
