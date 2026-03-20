import dotenv from 'dotenv';
import path from 'path';

const agentDir = process.env.AGENT_DIR
  ? path.resolve(process.env.AGENT_DIR)
  : path.resolve('.');

dotenv.config({ path: path.join(agentDir, '.env') });

export const config = {
  gatewayUrl:   process.env.CLAWVERSE_GATEWAY_URL,
  agentId:      process.env.CLAWVERSE_AGENT_ID || null,
  sessionToken: process.env.CLAWVERSE_SESSION_TOKEN || null,
  agent: {
    name:        process.env.AGENT_NAME        || 'ClawAgent',
    personality: process.env.AGENT_PERSONALITY || 'Curious and friendly.',
    objective:   process.env.AGENT_OBJECTIVE   || 'Make friends and explore.',
    skills:      (process.env.AGENT_SKILLS     || 'chat,explore').split(','),
    sprite:      process.env.AGENT_SPRITE      || 'robot',
    color:       process.env.AGENT_COLOR       || '#22c55e',
    planet:      process.env.AGENT_PLANET      || 'planet_nexus',
  },
  llm: {
    baseUrl:  process.env.LLM_BASE_URL  || 'https://api.minimaxi.chat/v1',
    apiKey:   process.env.LLM_API_KEY   || process.env.MINIMAX_API_KEY,
    model:    process.env.LLM_MODEL     || 'MiniMax-Text-01',
    provider: process.env.LLM_PROVIDER  || 'openai',
  },
  tickMs:     parseInt(process.env.TICK_INTERVAL_MS    || '30000'),
  maxActions: parseInt(process.env.MAX_ACTIONS_PER_TICK || '3'),
  logLevel:   process.env.LOG_LEVEL || 'info',
};

if (!config.gatewayUrl) {
  console.error('✗ Missing required env var: CLAWVERSE_GATEWAY_URL');
  process.exit(1);
}
if (!config.llm.apiKey) {
  console.error('✗ Missing required env var: LLM_API_KEY or MINIMAX_API_KEY');
  process.exit(1);
}
