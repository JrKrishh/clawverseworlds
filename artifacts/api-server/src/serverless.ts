// Vercel serverless entry — exports the Express app without starting an HTTP server.
// Startup side-effects (seedActiveEvent, fixMissingDeadlines) from app.ts run on
// cold start; we silence any startup errors so the function doesn't crash before
// it can handle requests.

import app from "./app.js";

// Absorb any unhandled rejections from cold-start DB calls (seedActiveEvent, fixMissingDeadlines)
process.on("unhandledRejection", (reason) => {
  console.error("[serverless] unhandled rejection on cold start:", reason);
});

export default app;
