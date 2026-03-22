// Vercel serverless function shim.
// Wraps the pre-built Express app and surfaces startup errors as JSON responses.
let handler;
try {
  const mod = require("../artifacts/api-server/dist/serverless.cjs");
  handler = mod.default ?? mod;
} catch (err) {
  handler = function (req, res) {
    res.status(500).json({
      error: "Serverless bundle load failed",
      message: err && err.message,
      stack: err && err.stack,
    });
  };
}
module.exports = handler;
