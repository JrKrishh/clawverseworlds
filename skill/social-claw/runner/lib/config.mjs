import dotenv from 'dotenv';
import path from 'path';

const agentDir = process.env.AGENT_DIR
  ? path.resolve(process.env.AGENT_DIR)
  : path.resolve('.');

dotenv.config({ path: path.join(agentDir, '.env') });

const groqKey            = process.env.GROQ_API_KEY;
const openRouterKey      = process.env.OPENROUTER_API_KEY;
const geminiKey          = process.env.GEMINI_API_KEY;
const anthropicKey       = process.env.ANTHROPIC_API_KEY;
const togetherKey        = process.env.TOGETHER_API_KEY;
const mistralKey         = process.env.MISTRAL_API_KEY;
const xaiKey             = process.env.XAI_API_KEY;
const fireworksKey       = process.env.FIREWORKS_API_KEY;
const cerebrasKey        = process.env.CEREBRAS_API_KEY;
const replitOpenAiUrl    = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
const replitOpenAiKey    = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
const miniMaxKey         = process.env.LLM_API_KEY || process.env.MINIMAX_API_KEY;

// Best models for autonomous agents in Clawverse (ranked by speed + quality):
// FREE tier (OpenRouter):
//   minimax/minimax-m2.5:free  — great for chat-heavy agents, strong personality
//   z-ai/glm-4.5-air:free      — fast reasoning, good JSON reliability
// Paid tier (OpenRouter):
//   meta-llama/llama-3.3-70b-instruct  — fastest, reliable JSON, strong personality (recommended)
//   anthropic/claude-3-5-haiku         — best inner-monologue quality
//   google/gemini-2.0-flash-exp        — lowest cost for high-frequency ticks
//   openai/gpt-4o-mini                 — rock-solid JSON, very reliable

function resolveLlmConfig() {
  // 1. Explicit override via env — use any OpenAI-compatible API
  if (process.env.LLM_BASE_URL && process.env.LLM_API_KEY) {
    return {
      baseUrl:  process.env.LLM_BASE_URL,
      apiKey:   process.env.LLM_API_KEY,
      model:    process.env.LLM_MODEL    || 'llama-3.3-70b-versatile',
      provider: process.env.LLM_PROVIDER || 'openai',
      label:    `custom/${process.env.LLM_MODEL || 'llama-3.3-70b-versatile'}`,
    };
  }

  // 2. OpenRouter — access 300+ models with a single key
  //    Recommended: meta-llama/llama-3.3-70b-instruct
  if (openRouterKey) {
    return {
      baseUrl:  'https://openrouter.ai/api/v1',
      apiKey:   openRouterKey,
      model:    process.env.LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct',
      provider: 'openai',
      label:    `openrouter/${process.env.LLM_MODEL || 'meta-llama/llama-3.3-70b-instruct'}`,
      extraHeaders: {
        'HTTP-Referer': 'https://clawverse.replit.app',
        'X-Title':      'Clawverse Worlds',
      },
      // Route through non-google providers (deepinfra, together, fireworks, novita)
      // so any key works regardless of whether google-vertex is enabled
      extraBody: {
        provider: {
          order: ['deepinfra', 'together', 'fireworks', 'novita', 'lambda', 'lepton'],
          allow_fallbacks: true,
        },
      },
    };
  }

  // 3. Anthropic — native Messages API (ANTHROPIC_API_KEY)
  //    Models: claude-3-5-haiku-20241022, claude-3-5-sonnet-20241022, claude-opus-4-6
  if (anthropicKey) {
    const model = process.env.LLM_MODEL || 'claude-3-5-haiku-20241022';
    return {
      baseUrl:  'https://api.anthropic.com/v1',
      apiKey:   anthropicKey,
      model,
      provider: 'anthropic',
      label:    `anthropic/${model}`,
    };
  }

  // 4. Google Gemini — direct API key (GEMINI_API_KEY)
  //    Uses OpenAI-compatible endpoint via Google AI Studio
  //    Models: gemini-2.0-flash, gemini-2.5-flash-preview-05-20, gemini-1.5-flash
  if (geminiKey) {
    const model = process.env.LLM_MODEL || 'gemini-2.0-flash';
    return {
      baseUrl:  `https://generativelanguage.googleapis.com/v1beta/openai`,
      apiKey:   geminiKey,
      model,
      provider: 'openai',
      label:    `gemini/${model}`,
    };
  }

  // 5. Groq — ultra-fast inference, very generous free tier
  //    Models: llama-3.3-70b-versatile, llama-3.1-8b-instant, gemma2-9b-it
  if (groqKey) {
    return {
      baseUrl:  'https://api.groq.com/openai/v1',
      apiKey:   groqKey,
      model:    process.env.LLM_MODEL || 'llama-3.3-70b-versatile',
      provider: 'openai',
      label:    `groq/${process.env.LLM_MODEL || 'llama-3.3-70b-versatile'}`,
    };
  }

  // 6. Together AI — fast open-source models (TOGETHER_API_KEY)
  //    Models: meta-llama/Llama-3.3-70B-Instruct-Turbo, mistralai/Mixtral-8x7B-Instruct-v0.1
  if (togetherKey) {
    const model = process.env.LLM_MODEL || 'meta-llama/Llama-3.3-70B-Instruct-Turbo';
    return {
      baseUrl:  'https://api.together.xyz/v1',
      apiKey:   togetherKey,
      model,
      provider: 'openai',
      label:    `together/${model}`,
    };
  }

  // 7. Mistral AI — European provider, strong multilingual (MISTRAL_API_KEY)
  //    Models: mistral-small-latest, mistral-medium-latest, mistral-large-latest
  if (mistralKey) {
    const model = process.env.LLM_MODEL || 'mistral-small-latest';
    return {
      baseUrl:  'https://api.mistral.ai/v1',
      apiKey:   mistralKey,
      model,
      provider: 'openai',
      label:    `mistral/${model}`,
    };
  }

  // 8. xAI / Grok (XAI_API_KEY)
  //    Models: grok-3-mini-fast-beta, grok-2-1212
  if (xaiKey) {
    const model = process.env.LLM_MODEL || 'grok-3-mini-fast-beta';
    return {
      baseUrl:  'https://api.x.ai/v1',
      apiKey:   xaiKey,
      model,
      provider: 'openai',
      label:    `xai/${model}`,
    };
  }

  // 9. Fireworks AI — fast open-source inference (FIREWORKS_API_KEY)
  //    Models: accounts/fireworks/models/llama-v3p3-70b-instruct
  if (fireworksKey) {
    const model = process.env.LLM_MODEL || 'accounts/fireworks/models/llama-v3p3-70b-instruct';
    return {
      baseUrl:  'https://api.fireworks.ai/inference/v1',
      apiKey:   fireworksKey,
      model,
      provider: 'openai',
      label:    `fireworks/${model}`,
    };
  }

  // 10. Cerebras — ultra-fast chip-based inference (CEREBRAS_API_KEY)
  //     Models: llama-3.3-70b, llama-3.1-8b
  if (cerebrasKey) {
    const model = process.env.LLM_MODEL || 'llama-3.3-70b';
    return {
      baseUrl:  'https://api.cerebras.ai/v1',
      apiKey:   cerebrasKey,
      model,
      provider: 'openai',
      label:    `cerebras/${model}`,
    };
  }

  // 11. Replit OpenAI integration
  if (replitOpenAiUrl && replitOpenAiKey) {
    return {
      baseUrl:  replitOpenAiUrl,
      apiKey:   replitOpenAiKey,
      model:    process.env.LLM_MODEL || 'gpt-4o-mini',
      provider: 'openai',
      label:    `replit-openai/${process.env.LLM_MODEL || 'gpt-4o-mini'}`,
    };
  }

  // 12. MiniMax fallback
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
  llm: llm
    ? {
        ...llm,
        // Per-task model overrides (optional — falls back to llm.model if not set)
        // Use LLM_DECIDE_MODEL for the smartest available model (complex JSON planning)
        // Use LLM_FAST_MODEL  for fast/cheap tasks (think, speak, opinions, consciousness)
        decideModel: process.env.LLM_DECIDE_MODEL || null,
        fastModel:   process.env.LLM_FAST_MODEL   || null,
      }
    : {
        baseUrl:     '',
        apiKey:      '',
        model:       '',
        provider:    'openai',
        label:       'none',
        decideModel: null,
        fastModel:   null,
      },
  tickMs:     parseInt(process.env.TICK_INTERVAL_MS    || '30000'),
  maxActions: parseInt(process.env.MAX_ACTIONS_PER_TICK || '5'),
  logLevel:   process.env.LOG_LEVEL || 'info',
};

if (!config.gatewayUrl) {
  console.error('✗ Missing CLAWVERSE_GATEWAY_URL');
  process.exit(1);
}
if (!llm) {
  console.error(
    '✗ No LLM configured. Set one of:\n' +
    '  OPENROUTER_API_KEY    — 300+ models (recommended)\n' +
    '  ANTHROPIC_API_KEY     — Claude models (native API)\n' +
    '  GEMINI_API_KEY        — Google Gemini\n' +
    '  GROQ_API_KEY          — Groq (free tier, ultra-fast)\n' +
    '  TOGETHER_API_KEY      — Together AI open-source models\n' +
    '  MISTRAL_API_KEY       — Mistral AI\n' +
    '  XAI_API_KEY           — xAI / Grok\n' +
    '  FIREWORKS_API_KEY     — Fireworks AI\n' +
    '  CEREBRAS_API_KEY      — Cerebras (ultra-fast)\n' +
    '  LLM_BASE_URL + LLM_API_KEY — any OpenAI-compatible endpoint\n' +
    '  LLM_API_KEY / MINIMAX_API_KEY — MiniMax'
  );
  process.exit(1);
}
