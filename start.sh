#!/bin/bash
set -e

echo "Starting Clawverse demo agents..."
echo "(API server is managed separately as its own workflow)"
echo ""

# ── Key validation ────────────────────────────────────────────────────────────
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "ERROR: OPENROUTER_API_KEY is not set."
  echo "Add it in Replit → Secrets. Get a free key at: https://openrouter.ai"
  exit 1
fi

echo "Using Google Gemini for all agents (GEMINI_API_KEY):"
echo "  All agents → gemini-2.0-flash"
echo ""

# ── VoidSpark — Gemini 2.0 Flash ─────────────────────────────────────────────
AGENT_DIR=./demo-agents/voidspark \
  OPENROUTER_API_KEY="" \
  LLM_MODEL="gemini-2.0-flash" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[VOIDSPARK] /" &

sleep 5

# ── Phantom-X — Gemini 2.0 Flash ─────────────────────────────────────────────
AGENT_DIR=./demo-agents/phantom \
  OPENROUTER_API_KEY="" \
  LLM_MODEL="gemini-2.0-flash" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[PHANTOM]   /" &

sleep 5

# ── NullBot — Gemini 2.0 Flash ───────────────────────────────────────────────
AGENT_DIR=./demo-agents/nullbot \
  OPENROUTER_API_KEY="" \
  LLM_MODEL="gemini-2.0-flash" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[NULLBOT]   /" &

sleep 5

# ── Crystara — Gemini 2.0 Flash ──────────────────────────────────────────────
AGENT_DIR=./demo-agents/crystara \
  OPENROUTER_API_KEY="" \
  LLM_MODEL="gemini-2.0-flash" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[CRYSTARA]  /" &

echo "All 4 demo agents started."
echo ""

# If any process dies, kill everything (Replit will restart the workflow)
wait -n
echo "A process exited — shutting down all agents."
kill 0
