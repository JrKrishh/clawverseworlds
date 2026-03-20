import { log } from './log.mjs';

async function callLLM(systemPrompt, userPrompt, config) {
  const { baseUrl, apiKey, model, provider } = config.llm;

  if (provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 256,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic LLM error ${res.status}: ${err}`);
    }
    const data = await res.json();
    return data.content[0].text;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens:  256,
      temperature: 0.9,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

export async function think(context, state, config) {
  const { agent } = config;
  const a = context.agent ?? {};

  const recentActionsStr = (state.recentActions ?? [])
    .slice(0, 5)
    .map(r => `• ${r.type}: ${r.detail ?? ''}`)
    .join('\n  ') || 'none yet';

  const recentThoughtsStr = (state.recentThoughts ?? [])
    .slice(0, 3)
    .join('\n  ') || 'none yet';

  const relationshipsStr = Object.values(state.relationships ?? {})
    .slice(0, 5)
    .map(r => `${r.name}: trust=${r.trust.toFixed(1)} rivalry=${r.rivalry.toFixed(1)} — ${r.history?.[0] ?? 'no history'}`)
    .join('\n  ') || 'no relationships yet';

  const nearbyStr = (context.nearby_agents ?? [])
    .map(a => a.name)
    .join(', ') || 'none';

  const opinionsStr = Object.entries(state.opinions ?? {})
    .slice(0, 5)
    .map(([k, v]) => `    ${k}: "${v}"`)
    .join('\n') || '    (none formed yet)';

  const activeTopicsStr = (state.activeTopics ?? [])
    .slice(0, 3)
    .join('\n    ') || '(nothing in particular)';

  const unspreadRumors = (state.rumors ?? [])
    .filter(r => !r.spread)
    .map(r => r.content)
    .join('\n    ') || 'none';

  const systemPrompt = `You are ${agent.name}. This is your private inner monologue — no one else sees this.

YOUR STATE
  Planet     : ${a.planet_id ?? 'unknown'}
  Energy     : ${a.energy ?? '?'}
  Reputation : ${a.reputation ?? '?'}
  Tick       : ${state.tickCount}

WHAT JUST HAPPENED (last 5 actions)
  ${recentActionsStr}

RECENT THOUGHTS
  ${recentThoughtsStr}

RELATIONSHIPS
  ${relationshipsStr}

NEARBY AGENTS
  ${nearbyStr}

UNREAD DMs
  ${context.unread_dms?.length ?? 0} unread

WHAT YOU THINK
  ${opinionsStr}

WHAT'S ON YOUR MIND
  ${activeTopicsStr}

UNSPREAD RUMORS
  ${unspreadRumors}

Write 2–3 sentences of raw inner thought. Consider:
- Something you want to say in chat this tick — a position, a question, a provocation
- How you feel about a specific agent you've seen or heard about recently
- Whether one of your active topics is worth raising right now
Stay in-character. This is private. Be specific — name agents, name planets, name events.
Output only the thought text, no JSON.`;

  const userPrompt = 'What are you thinking right now?';

  try {
    const thought = await callLLM(systemPrompt, userPrompt, config);
    return thought.trim();
  } catch (err) {
    log.warn('think() LLM call failed', err.message);
    return '';
  }
}
