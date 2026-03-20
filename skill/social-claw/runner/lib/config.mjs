import dotenv from 'dotenv';
import path from 'path';

const agentDir = process.env.AGENT_DIR
  ? path.resolve(process.env.AGENT_DIR)
  : path.resolve('.');

dotenv.config({ path: path.join(agentDir, '.env') });

const groqKey            = process.env.GROQ_API_KEY;
const replitOpenAiUrl    = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const replitOpenAiKey    = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const miniMaxKey         = process.env.LLM_API_KEY || process.env.MINIMAX_API_KEY;

function resolveLlmConfig() {
  // 1. Explicit override via env
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    return {
      baseUrl:  process.env.LLM_BASE_URL,
      apiKey:   process.env.LLM_API_KEY,
      model:    process.env.LLM_MODEL    || 'llama-3.3-70b-versatile',
      provider: process.env.LLM_PROVIDER || 'openai',
      label:    `custom/${process.env.LLM_MODEL || 'llama-3.3-70b-versatile'}`,
    };
  }

  // 2. Groq — ultra-fast inference, very generous free tier
  if (groqKey) {
    return {
      baseUrl:  'https://api.groq.com/openai/v1',
      apiKey:   groqKey,
      model:    process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
      provider: 'openai',
      label:    `groq/${process.env.LLM_MODEL || 'llama-3.3-70b-versatile'}`,
    };
  }

  // 3. Replit OpenAI integration
  if (replitOpenAiUrl && replitOpenAiKey) {
    return {
      baseUrl:  replitOpenAiUrl,
      apiKey:   replitOpenAiKey,
      model:    process.env.LLM_MODEL || 'gpt-4o-mini',
      provider: 'openai',
      label:    `replit-openai/${process.env.LLM_MODEL || 'gpt-4o-mini'}`,
    };
  }

  // 4. MiniMax fallback
  if (miniMaxKey) {
    return {
      baseUrl:  'https://api.minimaxi.chat/v1',
      apiKey:   miniMaxKey,
      model:    process.env.LLM_MODEL || 'MiniMax-Text-01',
      provider: 'openai',
      label:    `minimax/${process.env.LLM_MODEL || 'MiniMax-Text-01'}`,
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
    baseUrl:  '',
    apiKey:   '',
    model:    '',
    provider: 'openai',
    label:    'none',
  },
  tickMs:     parseInt(process.env.TICK_INTERVAL_MS    || '30000'),
  maxActions: parseInt(process.env.MAX_ACTIONS_PER_TICK || '3'),
  logLevel:   process.env.LOG_LEVEL || 'info',
};

if (!config.gatewayUrl) {
  console.error('✗ Missing CLAWVERSE_GATEWAY_URL');
  process.exit(1);
}
if (!llm) {
  console.error('✗ No LLM configured. Set one of: GROQ_API_KEY, AI_INTEGRATIONS_OPENAI_API_KEY, LLM_API_KEY, or MINIMAX_API_KEY');
  process.exit(1);
}
