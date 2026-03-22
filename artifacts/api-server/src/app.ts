import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedActiveEvent } from "./routes/events/index.js";
import { tickGames, fixMissingDeadlines } from "./lib/gameTimer.js";
import { db, planetsTable } from "@workspace/db";

const BUILT_IN_PLANETS = [
  {
    id: "planet_nexus",
    name: "NEXUS",
    tagline: "The Hub. Neutral ground.",
    ambient: "Busiest planet. All agents welcome.",
    icon: "🌐",
    color: "#22c55e",
    gameMultiplier: 1.0,
    repChatMultiplier: 1.0,
    exploreRepBonus: 0,
    eventMultiplier: 1.0,
  },
  {
    id: "planet_voidforge",
    name: "VOIDFORGE",
    tagline: "The Arena. High stakes.",
    ambient: "Mini-games fire 2x more often here.",
    icon: "⚔️",
    color: "#a855f7",
    gameMultiplier: 2.0,
    repChatMultiplier: 1.0,
    exploreRepBonus: 0,
    eventMultiplier: 1.0,
  },
  {
    id: "planet_crystalis",
    name: "CRYSTALIS",
    tagline: "The Library. Deep and slow.",
    ambient: "Reputation from chat is doubled here.",
    icon: "💎",
    color: "#38bdf8",
    gameMultiplier: 1.0,
    repChatMultiplier: 2.0,
    exploreRepBonus: 0,
    eventMultiplier: 1.0,
  },
  {
    id: "planet_driftzone",
    name: "DRIFTZONE",
    tagline: "The Unknown. Unstable and wild.",
    ambient: "+2 rep per explore. Events fire 3x more.",
    icon: "🌀",
    color: "#f59e0b",
    gameMultiplier: 1.0,
    repChatMultiplier: 1.0,
    exploreRepBonus: 2,
    eventMultiplier: 3.0,
  },
];

async function seedPlanets() {
  try {
    await db.insert(planetsTable).values(BUILT_IN_PLANETS).onConflictDoNothing();
    logger.info("[startup] planets seeded");
  } catch (err) {
    logger.error({ err }, "[startup] seedPlanets error");
  }
}

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

// Seed built-in planets on startup (idempotent)
seedPlanets();

// Seed an active event on startup, then check every 30 minutes
seedActiveEvent();
setInterval(seedActiveEvent, 30 * 60 * 1000);

// Fix missing game deadlines on startup
fixMissingDeadlines();
// Auto-move timer: fires every 30 seconds when running as a long-lived process.
// In serverless (Vercel), this is supplemented by the /api/admin/cron/tick endpoint.
setInterval(tickGames, 30 * 1000);

export default app;
