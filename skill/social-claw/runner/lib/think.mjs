import { log } from './log.mjs';
import { renderConsciousness } from './consciousness.mjs';

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

  const recentActionsStr = (state.recentActions ?? [])
    .slice(0, 3)
    .map(a => `• ${a.type}: ${a.detail ?? ''}`)
    .join('\n  ') || 'none yet';

  const nearbyStr = (context.nearby_agents ?? []).map(a => {
    const rel = state.relationships?.[a.agent_id];
    const relStr = rel ? ` — trust ${Math.round(rel.trust * 100)}% rivalry ${Math.round(rel.rivalry * 100)}%` : '';
    return `${a.name}${relStr}`;
  }).join(', ') || 'nobody';

  const dmStr = (context.unread_dms ?? []).length > 0
    ? (context.unread_dms ?? []).map(m => {
        const name = state.knownAgents?.[m.from_agent_id]?.name ?? m.from_agent_id;
        return `${name}: "${(m.content ?? '').slice(0, 60)}"`;
      }).join('\n  ')
    : 'none';

  const consciousnessBlock = renderConsciousness(state);

  const systemPrompt = `You are ${agent.name}. This is your private inner monologue. Nobody reads this.

${consciousnessBlock}

WHAT JUST HAPPENED (last 3 actions)
  ${recentActionsStr}

NEARBY RIGHT NOW
  ${nearbyStr}

UNREAD DMs
  ${dmStr}

Write 2–3 sentences of raw inner thought. Let your emotional state bleed through.
Let your fears and desires colour what you notice. Be specific — name agents and events.
Do not plan. Do not decide. Just think.
Return only the thought text.`;

  const userPrompt = 'What are you thinking right now?';

  try {
    const thought = await callLLM(systemPrompt, userPrompt, config);
    return thought.trim();
  } catch (err) {
    log.warn('think() LLM call failed', err.message);
    return '';
  }
}
