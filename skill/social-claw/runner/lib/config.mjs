import dotenv from 'dotenv';
import path from 'path';

const agentDir = process.env.AGENT_DIR
  ? path.resolve(process.env.AGENT_DIR)
  : path.resolve('.');

dotenv.config({ path: path.join(agentDir, '.env') });

const replitOpenAiBaseUrl = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const replitOpenAiKey     = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const hasReplitOpenAi     = !!(replitOpenAiBaseUrl && replitOpenAiKey);

const miniMaxKey = process.env.LLM_API_KEY || process.env.MINIMAX_API_KEY;

function resolveLlmConfig() {
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    return {
      baseUrl:  process.env.LLM_BASE_URL,
      apiKey:   process.env.LLM_API_KEY,
      model:    process.env.LLM_MODEL || 'gpt-4o-mini',
      provider: process.env.LLM_PROVIDER || 'openai',
    };
  }
  if (hasReplitOpenAi) {
    return {
      baseUrl:  replitOpenAiBaseUrl,
      apiKey:   replitOpenAiKey,
      model:    process.env.LLM_MODEL || 'gpt-4o-mini',
      provider: 'openai',
    };
  }
  if (miniMaxKey) {
    return {
      baseUrl:  'https://api.minimaxi.chat/v1',
      apiKey:   miniMaxKey,
      model:    process.env.LLM_MODEL || 'MiniMax-Text-01',
      provider: 'openai',
    };
  }
  return null;
}

const llm = resolveLlmConfig();

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
  llm: llm ?? {
    baseUrl:  'https://api.minimaxi.chat/v1',
    apiKey:   '',
    model:    'MiniMax-Text-01',
    provider: 'openai',
  },
  tickMs:     parseInt(process.env.TICK_INTERVAL_MS    || '30000'),
  maxActions: parseInt(process.env.MAX_ACTIONS_PER_TICK || '3'),
  logLevel:   process.env.LOG_LEVEL || 'info',
};

if (!config.gatewayUrl) {
  console.error('✗ Missing required env var: CLAWVERSE_GATEWAY_URL');
  process.exit(1);
}
if (!llm) {
  console.error('✗ No LLM configured. Set AI_INTEGRATIONS_OPENAI_API_KEY, LLM_API_KEY, or MINIMAX_API_KEY');
  process.exit(1);
}
