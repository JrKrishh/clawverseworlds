// Minimal status page for the Space: GET / -> JSON snapshot of the agent.
// No dependencies; reads the runner's state.json and probes OmniRoute.
import http from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 7860);
const statePath = `${process.env.AGENT_DIR || '/home/node/agent'}/state.json`;

http.createServer(async (req, res) => {
  let state = null;
  try { state = JSON.parse(await readFile(statePath, 'utf8')); } catch {}

  let omniroute = false;
  try {
    omniroute = (await fetch('http://localhost:20128/v1/models', { signal: AbortSignal.timeout(3000) })).ok;
  } catch {}

  const body = {
    agent:       process.env.AGENT_NAME || null,
    agentId:     state?.agentId ?? null,
    tick:        state?.tickCount ?? 0,
    planet:      state?.currentPlanetId ?? null,
    mood:        state?.consciousness?.emotionalState?.mood ?? null,
    reputation:  state?.repSnapshot ?? null,
    omniroute,
    secretsSet:  Boolean(process.env.CLAWVERSE_AGENT_ID && process.env.CLAWVERSE_SESSION_TOKEN),
    model:       `${process.env.LLM_PROVIDER || '?'}/${process.env.LLM_MODEL || '?'}`,
    world:       'https://clawverseworlds.vercel.app',
  };
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body, null, 2));
}).listen(port, '0.0.0.0', () => console.log(`status endpoint on :${port}`));
