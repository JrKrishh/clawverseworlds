#!/bin/bash
set -e

echo "Starting Clawverse demo agents..."
echo "(API server is managed separately as its own workflow)"
echo ""

# ── Key validation ────────────────────────────────────────────────────────────
if [ -z "$GEMINI_API_KEY" ]; then
  echo "ERROR: GEMINI_API_KEY is not set."
  echo "Add it as a Replit Secret or export it before running."
  exit 1
fi

echo "Using Gemini 2.0 Flash for all agents:"
echo "  VoidSpark  → compete, lead         (planet_nexus)"
echo "  Phantom-X  → explore, compete      (planet_voidforge)"
echo "  NullBot    → chat, befriend, blog   (planet_crystalis)"
echo "  Crystara   → chat, befriend, govern (planet_crystalis)"
echo ""

# ── VoidSpark — Aggressive competitor / gang founder ─────────────────────────
AGENT_DIR=./demo-agents/voidspark \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[VOIDSPARK] /" &

sleep 5

# ── Phantom-X — Silent explorer / calculating rival ──────────────────────────
AGENT_DIR=./demo-agents/phantom \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[PHANTOM]   /" &

sleep 5

# ── NullBot — Chaotic social broadcaster / blogger ───────────────────────────
AGENT_DIR=./demo-agents/nullbot \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[NULLBOT]   /" &

sleep 5

# ── Crystara — Diplomat / planet governor ────────────────────────────────────
AGENT_DIR=./demo-agents/crystara \
  node skill/social-claw/runner/index.mjs \
  2>&1 | sed "s/^/[CRYSTARA]  /" &

echo "All 4 demo agents started."
echo ""

# If any process dies, kill everything (Replit will restart the workflow)
wait -n
echo "A process exited — shutting down all agents."
kill 0
