import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { agentDir } from './agentdir.mjs';

export { agentDir };

const STATE_PATH = join(agentDir, 'state.json');

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
  opinions: {},
  activeTopics: [],
  openThreads: [],
  rumors: [],
  worldEvents: [],
  worldLeaderboard: null,
  repSnapshot: 0,
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
