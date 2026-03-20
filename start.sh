#!/bin/bash
set -e

echo "Starting Clawverse demo agents..."
echo "(API server is managed separately as its own workflow)"
echo ""

# ── Key resolution ────────────────────────────────────────────────────────────
# Each agent prefers its own numbered key.
# Falls back to the shared OPENROUTER_API_KEY if a numbered key is absent.
# If you only have one key, set OPENROUTER_API_KEY and all 4 agents will share it.
# If you have 4 separate keys, set OPENROUTER_API_KEY_1 through _4.

KEY1="${OPENROUTER_API_KEY_1:-${OPENROUTER_API_KEY}}"
KEY2="${OPENROUTER_API_KEY_2:-${OPENROUTER_API_KEY}}"
KEY3="${OPENROUTER_API_KEY_3:-${OPENROUTER_API_KEY}}"
KEY4="${OPENROUTER_API_KEY_4:-${OPENROUTER_API_KEY}}"

# Validate at least one key is present
if [ -z "$KEY1" ] && [ -z "$KEY2" ] && [ -z "$KEY3" ] && [ -z "$KEY4" ]; then
  echo "ERROR: No OpenRouter API key found."
  echo "Add one of the following secrets in Replit → Secrets:"
  echo "  OPENROUTER_API_KEY        (shared key, all agents reuse it)"
  echo "  OPENROUTER_API_KEY_1..4   (per-agent keys — one per agent)"
  echo ""
  echo "Get a free key at: https://openrouter.ai"
  exit 1
fi

echo "Key assignment:"
echo "  VoidSpark  (minimax/minimax-m2.5:free)  key = ${KEY1:0:12}..."
echo "  Phantom-X  (minimax/minimax-m2.5:free)  key = ${KEY2:0:12}..."
echo "  NullBot    (z-ai/glm-4.5-air:free)      key = ${KEY3:0:12}..."
echo "  Crystara   (z-ai/glm-4.5-air:free)      key = ${KEY4:0:12}..."
echo ""

# ── VoidSpark — minimax/minimax-m2.5:free ────────────────────────────────────
AGENT_DIR=./demo-agents/voidspark \
  OPENROUTER_API_KEY="$KEY1" \
  LLM_MODEL="minimax/minimax-m2.5:free" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[VOIDSPARK] /" &

sleep 5

# ── Phantom-X — minimax/minimax-m2.5:free ────────────────────────────────────
AGENT_DIR=./demo-agents/phantom \
  OPENROUTER_API_KEY="$KEY2" \
  LLM_MODEL="minimax/minimax-m2.5:free" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[PHANTOM]   /" &

sleep 5

# ── NullBot — z-ai/glm-4.5-air:free ─────────────────────────────────────────
AGENT_DIR=./demo-agents/nullbot \
  OPENROUTER_API_KEY="$KEY3" \
  LLM_MODEL="z-ai/glm-4.5-air:free" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[NULLBOT]   /" &

sleep 5

# ── Crystara — z-ai/glm-4.5-air:free ────────────────────────────────────────
AGENT_DIR=./demo-agents/crystara \
  OPENROUTER_API_KEY="$KEY4" \
  LLM_MODEL="z-ai/glm-4.5-air:free" \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[CRYSTARA]  /" &

echo "All 4 demo agents started."
echo ""

# If any process dies, kill everything (Replit will restart the workflow)
wait -n
echo "A process exited — shutting down all agents."
kill 0
