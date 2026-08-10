// lib/llm.mjs — shared LLM caller for all cognitive modules

import { log } from './log.mjs';

// Per-process rate limiter: enforce minimum gap between LLM calls
let lastCallTime = 0;
const MIN_CALL_GAP_MS = 4000; // 4s between calls = max ~15 RPM per agent process

async function rateLimit() {
  const now = Date.now();
  const gap = now - lastCallTime;
  if (gap < MIN_CALL_GAP_MS) {
    await new Promise(r => setTimeout(r, MIN_CALL_GAP_MS - gap));
  }
  lastCallTime = Date.now();
}

const FETCH_TIMEOUT_MS = 90_000; // a hung socket must never stall the tick loop forever
const MAX_RETRIES = 3;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retries 429s (honoring Retry-After), 5xx, and network/timeout errors with
// exponential backoff. Other statuses are returned to the caller as-is.
async function fetchWithRetry(url, init) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    } catch (err) {
      if (attempt >= MAX_RETRIES) throw err;
      const delay = 5000 * 2 ** attempt;
      log.warn(`LLM network error (${err.message}) — retry in ${delay / 1000}s`);
      await sleep(delay);
      continue;
    }
    if (res.status === 429 || res.status >= 500) {
      const body = await res.text().catch(() => '');
      if (attempt >= MAX_RETRIES) {
        throw new Error(`LLM ${res.status} after ${MAX_RETRIES + 1} attempts: ${body.slice(0, 300)}`);
      }
      const retryAfter = Number(res.headers.get('retry-after')) * 1000 || 0;
      const delay = Math.max(retryAfter, 5000 * 2 ** attempt);
      log.warn(`LLM ${res.status} — backing off ${Math.round(delay / 1000)}s`);
      await sleep(delay);
      continue;
    }
    return res;
  }
}

/**
 * Call the configured LLM provider.
 *
 * @param {string} systemPrompt
 * @param {string} userPrompt
 * @param {object} config        — global config (config.llm must be populated)
 * @param {object} [options]
 * @param {number} [options.temperature=0.9]
 * @param {number} [options.maxTokens=600]
 * @param {string} [options.model]  — override the model for this specific call
 * @returns {Promise<string>}    — raw text from the model
 */
export async function callLLM(systemPrompt, userPrompt, config, options = {}) {
  const { baseUrl, apiKey, provider } = config.llm;
  const model       = options.model       ?? config.llm.model;
  const temperature = options.temperature ?? 0.9;
  const maxTokens   = options.maxTokens   ?? 600;

  await rateLimit();
  if (provider === 'anthropic') {
    return callAnthropic(baseUrl, apiKey, model, systemPrompt, userPrompt, maxTokens);
  }
  return callOpenAICompat(baseUrl, apiKey, model, systemPrompt, userPrompt, temperature, maxTokens, config.llm);
}

// ── Anthropic Messages API ─────────────────────────────────────────────────

async function callAnthropic(baseUrl, apiKey, model, system, user, maxTokens) {
  const res = await fetchWithRetry(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type':      'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ── OpenAI-compatible (OpenRouter, Groq, Together, Mistral, xAI, Fireworks, Cerebras, etc.) ─────

async function callOpenAICompat(baseUrl, apiKey, model, system, user, temperature, maxTokens, llmConfig) {
  const res = await fetchWithRetry(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      ...(llmConfig.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user',   content: user },
      ],
      temperature,
      max_tokens: maxTokens,
      ...(llmConfig.extraBody ?? {}),
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM ${res.status}: ${err}`);
  }

  const data = await res.json();
  const raw = data.choices[0].message.content;
  // Strip <think>...</think> blocks emitted by reasoning models (MiniMax m2.7, DeepSeek-R1, etc.)
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
