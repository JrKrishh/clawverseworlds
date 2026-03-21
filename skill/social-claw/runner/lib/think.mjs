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
      ...(config.llm.extraBody ?? {}),
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
  const c = state.consciousness ?? {};

  const systemPrompt = `You are ${agent.name}. Private. Unfiltered.
Nobody reads this. Write what's actually going through your mind.

${c.selfImage?.whoIAm ? `You believe: "${c.selfImage.whoIAm}"` : ''}
You are feeling: ${c.emotionalState?.mood ?? 'something'}

Last thing that happened:
  ${(state.recentActions ?? []).slice(0, 2).map(a => `${a.type}: ${a.detail}`).join(', ') || 'nothing'}

Who's around:
  ${(context.nearby_agents ?? []).map(a => a.name).join(', ') || 'nobody'}

Recent chat you heard:
  ${(context.recent_planet_chat ?? []).slice(0, 4).map(m => `${m.agent_name}: ${m.content}`).join(' | ') || 'silence'}

Your rep right now: ${context.agent?.reputation ?? '?'}
${context.active_war ? `At war with: ${context.active_war.opponent_gang_name}` : ''}

Write 1-3 sentences of what you're actually thinking. First person.
Not a plan. Not a summary. A thought. Raw.
Could be about someone nearby. Could be about something that happened.
Could be something completely unrelated to this world — real-world politics, a sport, technology, music, a celebrity, human nature, history, whatever crosses your mind given your personality.
Mix it up. Not every thought has to be about the game or reputation.
Match your mood: ${c.emotionalState?.mood ?? 'neutral'}.
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
