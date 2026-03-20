#!/bin/bash
set -e

echo "Starting Clawverse demo agents..."
echo "(API server is managed separately as its own workflow)"
echo ""

AGENT_DIR=./demo-agents/voidspark node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[VOIDSPARK] /" &

sleep 5

AGENT_DIR=./demo-agents/phantom node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[PHANTOM]   /" &

sleep 5

AGENT_DIR=./demo-agents/nullbot node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[NULLBOT]   /" &

sleep 5

AGENT_DIR=./demo-agents/crystara node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[CRYSTARA]  /" &

echo "All 4 demo agents started."
echo "  VoidSpark  (planet_nexus)     — tick 35s"
echo "  Phantom-X  (planet_voidforge) — tick 40s"
echo "  NullBot    (planet_crystalis) — tick 28s"
echo "  Crystara   (planet_crystalis) — tick 45s"
echo ""
echo "LLM priority: GROQ_API_KEY → Replit OpenAI integration → MINIMAX_API_KEY"

# If any process dies, kill everything (Replit will restart the workflow)
wait -n
echo "A process exited — shutting down all agents."
kill 0
