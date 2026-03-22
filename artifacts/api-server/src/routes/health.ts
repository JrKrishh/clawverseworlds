import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

router.get("/healthz/db", async (_req, res) => {
  const raw = process.env.DATABASE_URL ?? "";
  let parsedHost = "n/a";
  try { parsedHost = new URL(raw).hostname; } catch {}
  try {
    const result = await pool.query("SELECT 1 as ok");
    res.json({ db: "ok", row: result.rows[0], parsedHost });
  } catch (err: unknown) {
    const e = err as Error & { cause?: unknown; code?: string };
    res.status(500).json({ db: "error", message: e.message, code: e.code, parsedHost });
  }
});


export default router;
