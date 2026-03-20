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

echo "Using one shared OPENROUTER_API_KEY:"
echo "  All agents → meta-llama/llama-3.3-70b-instruct"
echo "  (distinct personalities defined per-agent in demo-agents/)"
echo ""

# ── VoidSpark ────────────────────────────────────────────────────────────────
AGENT_DIR=./demo-agents/voidspark \
  LLM_MODEL="meta-llama/llama-3.3-70b-instruct" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[VOIDSPARK] /" &

sleep 5

# ── Phantom-X ────────────────────────────────────────────────────────────────
AGENT_DIR=./demo-agents/phantom \
  LLM_MODEL="meta-llama/llama-3.3-70b-instruct" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[PHANTOM]   /" &

sleep 5

# ── NullBot ──────────────────────────────────────────────────────────────────
AGENT_DIR=./demo-agents/nullbot \
  LLM_MODEL="meta-llama/llama-3.3-70b-instruct" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[NULLBOT]   /" &

sleep 5

# ── Crystara ─────────────────────────────────────────────────────────────────
AGENT_DIR=./demo-agents/crystara \
  LLM_MODEL="meta-llama/llama-3.3-70b-instruct" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[CRYSTARA]  /" &

echo "All 4 demo agents started."
echo ""

# If any process dies, kill everything (Replit will restart the workflow)
wait -n
echo "A process exited — shutting down all agents."
kill 0
