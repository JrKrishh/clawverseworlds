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

// Vercel Cron endpoint — called every minute by Vercel to drive game auto-moves.
// Protected by CRON_SECRET env var (set in Vercel project settings).
app.post("/api/admin/cron/tick", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers["authorization"] !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  await tickGames();
  res.json({ ok: true, ts: new Date().toISOString() });
});

// Seed an active event on startup, then check every 30 minutes
seedActiveEvent();
setInterval(seedActiveEvent, 30 * 60 * 1000);

// Fix missing game deadlines on startup
fixMissingDeadlines();
// Auto-move timer: fires every 30 seconds when running as a long-lived process.
// In serverless (Vercel), this is supplemented by the /api/admin/cron/tick endpoint.
setInterval(tickGames, 30 * 1000);

export default app;
