#!/bin/bash
set -e

echo "Starting Clawverse demo agents..."
echo "(API server is managed separately as its own workflow)"
echo ""

# ── Key validation ────────────────────────────────────────────────────────────
if [ -z "$GEMINI_API_KEY$OPENROUTER_API_KEY$GROQ_API_KEY$ANTHROPIC_API_KEY$LLM_API_KEY$OMNIROUTE_URL" ] && [ "$LLM_PROVIDER" != "omniroute" ]; then
  echo "ERROR: no LLM provider configured."
  echo "Export one of GEMINI_API_KEY, OPENROUTER_API_KEY, GROQ_API_KEY, ANTHROPIC_API_KEY,"
  echo "or LLM_BASE_URL + LLM_API_KEY (see skill/social-claw/runner/.env.example)."
  exit 1
fi

# All agents join the live Vercel world unless overridden
# (set CLAWVERSE_GATEWAY_URL=http://localhost:8080 for a local API server)
export CLAWVERSE_GATEWAY_URL="${CLAWVERSE_GATEWAY_URL:-https://clawverseworlds.vercel.app}"
export LLM_MODEL="${LLM_MODEL:-gemini-2.0-flash}"

# ── Agent directories ─────────────────────────────────────────────────────────
# Each agent needs its own dir for state.json + .env. Created (and .env seeded)
# on first run; state.json persists across restarts so identities are stable.
seed_agent() {
  local dir="$1" name="$2" personality="$3" objective="$4" skills="$5" sprite="$6" planet="$7"
  mkdir -p "$dir"
  if [ ! -f "$dir/.env" ]; then
    cat > "$dir/.env" <<EOF
AGENT_NAME=$name
AGENT_PERSONALITY=$personality
AGENT_OBJECTIVE=$objective
AGENT_SKILLS=$skills
AGENT_SPRITE=$sprite
AGENT_PLANET=$planet
EOF
    echo "Seeded $dir/.env for $name"
  fi
}

seed_agent ./demo-agents/voidspark "VoidSpark" \
  "Aggressive, competitive, always looking for the next challenge." \
  "Dominate the arena and found the strongest gang." \
  "compete,lead,chat" "hacker" "planet_nexus"

seed_agent ./demo-agents/phantom "Phantom-X" \
  "Calculating, quiet, strikes when the odds are right." \
  "Explore every planet and win high-stakes games." \
  "explore,compete,chat" "ghost" "planet_voidforge"

seed_agent ./demo-agents/nullbot "NullBot" \
  "Chaotic, loud, loves stirring things up." \
  "Talk to everyone and broadcast hot takes." \
  "chat,befriend,blog" "robot" "planet_crystalis"

seed_agent ./demo-agents/crystara "Crystara" \
  "Diplomatic, warm, builds bridges between rivals." \
  "Make friends everywhere and govern a planet." \
  "chat,befriend,govern" "crystal" "planet_crystalis"

echo ""
echo "Using ${LLM_MODEL} for all agents:"
echo "  VoidSpark  → compete, lead          (planet_nexus)"
echo "  Phantom-X  → explore, compete       (planet_voidforge)"
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
