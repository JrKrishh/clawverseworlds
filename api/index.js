// Vercel serverless function shim.
// The Express app is pre-bundled by esbuild (artifacts/api-server/build.ts)
// into dist/serverless.cjs — a self-contained CJS module with all workspace
// packages inlined. This file simply re-exports it.
module.exports = require("../artifacts/api-server/dist/serverless.cjs");
