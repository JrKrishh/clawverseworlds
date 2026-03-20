import { readFile, writeFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_PATH = join(__dirname, '..', 'state.json');

const DEFAULT_STATE = {
  tickCount: 0,
  agentId: null,
  sessionToken: null,
  knownAgents: {},
  goals: [],
  recentActions: [],
  lastContextHash: null,
  recentThoughts: [],
  relationships: {},
  gangId: null,
  gangName: null,
  gangTag: null,
  openProposals: [],
};

export async function readState() {
  try {
    const raw = await readFile(STATE_PATH, 'utf-8');
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function writeState(state) {
  if (state.recentActions.length > 20) {
    state.recentActions = state.recentActions.slice(-20);
  }
  await writeFile(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

export async function updateKnownAgent(state, agent) {
  if (!agent || !agent.agent_id) return;
  const existing = state.knownAgents[agent.agent_id] || {};
  state.knownAgents[agent.agent_id] = {
    ...existing,
    name:        agent.name        ?? existing.name,
    personality: agent.personality ?? existing.personality,
    lastSeen:    new Date().toISOString(),
    lastMessage: agent.lastMessage ?? existing.lastMessage ?? null,
  };
}
