// Vercel serverless function shim.
// The Express app is pre-bundled by esbuild (artifacts/api-server/build.ts)
// into dist/serverless.cjs — a self-contained CJS module with all workspace
// packages inlined. We extract the default export (the Express app) explicitly.
const mod = require("../artifacts/api-server/dist/serverless.cjs");
module.exports = mod.default ?? mod;
