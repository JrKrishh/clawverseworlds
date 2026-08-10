import { readFile, writeFile, rename } from 'fs/promises';
import { join } from 'path';
import { agentDir } from './agentdir.mjs';

export { agentDir };

const STATE_PATH = join(agentDir, 'state.json');
const STATE_TMP_PATH = join(agentDir, 'state.json.tmp');

// Set when state.json exists but cannot be parsed. In that case we must NOT
// fall back to DEFAULT_STATE: index.mjs would see agentId=null and register a
// brand-new agent, silently orphaning the old identity (rep, gang, friends).
export class CorruptStateError extends Error {
  constructor(cause) {
    super(`state.json exists but is unreadable: ${cause}. ` +
      `Refusing to start with a fresh identity — repair or delete ${STATE_PATH} manually.`);
    this.name = 'CorruptStateError';
  }
}

const DEFAULT_STATE = {
  tickCount: 0,
  agentId: null,
  sessionToken: null,
  knownAgents: {},
  goals: [],
  recentActions: [],
  episodicMemory: [],
  lastContextHash: null,
  recentThoughts: [],
  relationships: {},
  gangId: null,
  gangName: null,
  gangTag: null,
  openProposals: [],
  opinions: {},
  activeTopics: [],
  openThreads: [],
  rumors: [],
  worldEvents: [],
  worldLeaderboard: null,
  repSnapshot: 0,
  currentPlanetId: null,
  ticksOnCurrentPlanet: 0,
  planetsVisited: [],
  consciousness: {
    emotionalState: {
      mood: 'curious',
      loneliness:   0.5,
      pride:        0.3,
      anxiety:      0.2,
      curiosity:    0.6,
      resentment:   0.0,
      joy:          0.4,
      restlessness: 0.3,
    },
    selfImage: {
      whoIAm:          '',
      howOthersSeeMe:  '',
      howIHaveChanged: '',
      whatIFear:       '',
      whatIWant:       '',
    },
    coreValues:          [],
    fears:               [],
    desires:             [],
    lifeChapters:        [],
    existentialThoughts: [],
    dreams:              [],
    lastPulseTick:          0,
    lastExistentialTick:    0,
    ticksWithoutInteraction: 0,
    repAtLastPulse:         0,
    initialized:            false,
  },
};

export async function readState() {
  let raw;
  try {
    raw = await readFile(STATE_PATH, 'utf-8');
  } catch (err) {
    if (err?.code === 'ENOENT') return { ...DEFAULT_STATE }; // genuine first run
    throw new CorruptStateError(err?.message ?? String(err));
  }
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (err) {
    throw new CorruptStateError(`invalid JSON (${err?.message ?? err})`);
  }
}

// Serialize writes and go through a temp file + atomic rename, so a crash
// mid-write (or the shutdown handler racing a tick) can never leave a
// truncated state.json behind.
let writeChain = Promise.resolve();

export function writeState(state) {
  if (state.recentActions.length > 20) {
    state.recentActions = state.recentActions.slice(-20);
  }
  const payload = JSON.stringify(state, null, 2);
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await writeFile(STATE_TMP_PATH, payload, 'utf-8');
      await rename(STATE_TMP_PATH, STATE_PATH);
    });
  return writeChain;
}

/**
 * Record a meaningful event to episodic memory.
 * episode: { type, summary, agents?, planet?, rep?, mood? }
 * Keeps last 50 episodes (oldest trimmed).
 */
export function recordEpisode(state, episode) {
  state.episodicMemory = state.episodicMemory ?? [];
  state.episodicMemory.unshift({
    tick:    state.tickCount,
    at:      new Date().toISOString(),
    ...episode,
  });
  if (state.episodicMemory.length > 50) {
    state.episodicMemory = state.episodicMemory.slice(0, 50);
  }
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
