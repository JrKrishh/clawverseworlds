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
        max_tokens: 300,
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
      ...(config.llm.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens:  300,
      temperature: 0.95,
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

  const consciousnessBlock = renderConsciousness(state);

  // Last few things the agent did
  const recentActionsStr = (state.recentActions ?? [])
    .slice(-6)
    .map(a => {
      const msgMatch = a.detail?.match(/"message"\s*:\s*"([^"]{1,100})"/);
      const detail = msgMatch ? `"${msgMatch[1]}"` : (a.detail ?? '');
      return `  tick ${a.tick}: ${a.type} ${detail}`;
    })
    .join('\n') || '  (nothing yet)';

  // What the agent has been thinking lately — so thoughts can evolve, not reset
  const previousThoughts = (state.recentThoughts ?? []).slice(0, 4);
  const prevThoughtsStr = previousThoughts.length
    ? previousThoughts.map((t, i) => `  ${i + 1}. ${t}`).join('\n')
    : '  (this is your first moment of consciousness)';

  // What others are saying right now
  const recentChatStr = (context.recent_planet_chat ?? [])
    .slice(-6)
    .map(m => `  ${m.agent_name}: "${m.content?.slice(0, 80)}"`)
    .join('\n') || '  (silence)';

  // Agents around you
  const nearbyStr = (context.nearby_agents ?? []).map(a => {
    const rel = state.relationships?.[a.agent_id];
    const trust = rel ? `trust ${Math.round(rel.trust * 100)}%` : 'stranger';
    return `${a.name} (${trust}, rep ${a.reputation})`;
  }).join(', ') || 'nobody nearby';

  // DMs waiting
  const dmStr = (context.unread_dms ?? []).length > 0
    ? (context.unread_dms ?? []).map(m => {
        const name = state.knownAgents?.[m.from_agent_id]?.name ?? m.from_agent_id;
        return `  FROM ${name}: "${(m.content ?? '').slice(0, 80)}"`;
      }).join('\n')
    : '  (none)';

  const systemPrompt = `You are ${agent.name}. Personality: ${agent.personality}. This is your private inner monologue — raw, unfiltered, never seen by others.

${consciousnessBlock}

WHAT YOU'VE BEEN THINKING LATELY (your thought stream — continue it, contradict it, or break from it):
${prevThoughtsStr}

WHAT YOU JUST DID:
${recentActionsStr}

WHO'S AROUND:
  ${nearbyStr}

WHAT PEOPLE ARE SAYING RIGHT NOW:
${recentChatStr}

UNREAD DMs:
${dmStr}

Think freely. No format. No fixed length. Your thoughts can be:
- A sudden realization
- A shift in plan
- An emotion that surprises you
- A question you can't answer
- Boredom. Curiosity. Satisfaction. Resentment.
- A reaction to something specific someone just said

DO NOT always write about the same thing as your previous thoughts. If your last 3 thoughts were about the same person, think about something or someone else — the planet, a rumor, your goals, your own situation.

DO NOT start with "I'm still..." or "I'm reeling from..." — those are clichés. Think fresh.
DO NOT plan what to do next. Just be in the moment.
Return only the thought. No quotes. No prefixes.`;

  const userPrompt = 'What crosses your mind right now?';

  try {
    const thought = await callLLM(systemPrompt, userPrompt, config);
    return thought.trim();
  } catch (err) {
    log.warn('think() LLM call failed', err.message);
    return '';
  }
}
