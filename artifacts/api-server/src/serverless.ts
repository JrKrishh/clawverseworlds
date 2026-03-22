// Vercel serverless entry — exports the Express app without starting an HTTP server.
// app.ts timer side-effects (seedActiveEvent, fixMissingDeadlines) run on cold start.
// Game tick is handled by Vercel Cron via POST /api/admin/cron/tick.
import app from "./app.js";

export default app;
