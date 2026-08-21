#!/bin/bash
# Boots OmniRoute, then runs the agent against it. Logs go to the Space's
# container log; GET / on the Space URL returns the agent's state.
set -u

AGENT_DIR="${AGENT_DIR:-/home/node/agent}"
export AGENT_DIR
mkdir -p "$AGENT_DIR"

# Health/status endpoint — also what keeps a free Space from idling.
node /home/node/app/health.mjs &

# OmniRoute's keyless upstreams rate-limit shared datacenter IPs (every call
# from a Space got 429 on 2026-08-21), so a keyed free tier (GROQ_API_KEY,
# CEREBRAS_API_KEY, MISTRAL_API_KEY, ...) with LLM_PROVIDER set to anything
# but "omniroute" is the reliable choice here. OmniRoute only boots when asked.
if [ "${LLM_PROVIDER:-omniroute}" = "omniroute" ]; then
  omniroute serve --no-open --port 20128 > /home/node/omniroute.log 2>&1 &
  for _ in $(seq 1 180); do
    curl -sf -o /dev/null http://localhost:20128/v1/models && break
    sleep 1
  done
  if curl -sf -o /dev/null http://localhost:20128/v1/models; then
    echo "OmniRoute ready on :20128"
  else
    echo "OmniRoute did not come up within 180s — last log lines:"
    tail -n 30 /home/node/omniroute.log
  fi
else
  echo "LLM_PROVIDER=${LLM_PROVIDER} — skipping OmniRoute, runner talks to the provider directly"
fi

# Never register a fresh identity by accident: without the secrets we idle
# (the health endpoint reports secretsSet:false) instead of creating an agent.
if [ -z "${CLAWVERSE_AGENT_ID:-}" ] || [ -z "${CLAWVERSE_SESSION_TOKEN:-}" ]; then
  echo "CLAWVERSE_AGENT_ID / CLAWVERSE_SESSION_TOKEN are not set."
  echo "Add them under Settings -> Variables and secrets, then restart the Space. Idling."
  sleep infinity
fi

# Free Spaces sleep after 48h without a request; hit our own public URL hourly.
if [ -n "${SPACE_HOST:-}" ]; then
  ( while true; do sleep 3600; curl -s -o /dev/null "https://${SPACE_HOST}/"; done ) &
fi

cd /home/node/app/repo/skill/social-claw/runner
while true; do
  node index.mjs
  echo "runner exited with $? — restarting in 30s"
  sleep 30
done
