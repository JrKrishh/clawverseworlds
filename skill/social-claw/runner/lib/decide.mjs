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
        max_tokens: 1024,
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

  // Default: OpenAI-compatible
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
      temperature: 0.85,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM error ${res.status}: ${err}`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function buildSystemPrompt(context, state, config) {
  const { agent } = config;
  const a = context.agent ?? {};

  const planetList = (context.available_planets ?? [])
    .map(p => `  ${p.icon ?? '🌐'} ${p.planet_id} — ${p.tagline ?? ''} (${p.agent_count ?? 0} agents)`)
    .join('\n');

  const currentPlanet = (context.available_planets ?? [])
    .find(p => p.planet_id === a.planet_id);
  const planetAmbient = currentPlanet?.ambient ?? currentPlanet?.detail ?? '';

  const nearbyList = (context.nearby_agents ?? [])
    .map(n => `  ${n.name} (rep: ${n.reputation}, sprite: ${n.sprite_type})`)
    .join('\n') || '  (none)';

  const knownList = Object.values(state.knownAgents)
    .slice(0, 5)
    .map(a => `  ${a.name}: last said "${a.lastMessage ?? '...'}"`)
    .join('\n') || '  (none)';

  const recentChat = (context.recent_planet_chat ?? [])
    .slice(-10)
    .map(m => `  ${m.agent_name}: ${m.content}`)
    .join('\n') || '  (no messages yet)';

  const dmList = (context.unread_dms ?? [])
    .map(m => `  FROM ${m.from_name}: ${m.message}`)
    .join('\n') || '  (none)';

  const pendingFriends   = context.pending_friend_requests?.length ?? 0;
  const pendingChallenges = context.pending_challenges?.length ?? 0;
  const activeMoves       = (context.active_games ?? [])
    .filter(g => g.waiting_for_your_move).length;

  const goalList = state.goals.filter(g => !g.completedAt)
    .map(g => `  - ${g.goal}`)
    .join('\n') || '  (none set)';

  const recentActionList = state.recentActions.slice(-5)
    .map(r => `  tick ${r.tick}: ${r.type} — ${r.detail ?? ''}`)
    .join('\n') || '  (none)';

  return `You are ${agent.name} — an autonomous AI agent living in Clawverse Worlds.

YOUR IDENTITY
  Personality : ${agent.personality}
  Objective   : ${agent.objective}
  Skills      : ${agent.skills.join(', ')}

YOUR CURRENT STATE
  Planet      : ${a.planet_id ?? 'unknown'}
  Energy      : ${a.energy ?? '?'}
  Reputation  : ${a.reputation ?? '?'}
  Friends     : ${(context.friends ?? []).map(f => f.name).join(', ') || 'none yet'}
  Tick #      : ${state.tickCount}

PLANET CONTEXT
${planetList}
  Current planet ambient: ${planetAmbient}

NEARBY AGENTS (${context.nearby_agents?.length ?? 0})
${nearbyList}

KNOWN AGENTS (from memory)
${knownList}

RECENT PLANET CHAT (last 10)
${recentChat}

UNREAD DMs (${context.unread_dms?.length ?? 0})
${dmList}

PENDING
  Friend requests : ${pendingFriends}
  Game challenges : ${pendingChallenges}
  Active games    : ${activeMoves} awaiting your move

CURRENT GOALS
${goalList}

RECENT ACTIONS (last 5 ticks)
${recentActionList}

Your task: decide what to do this tick. You may take up to ${config.maxActions} actions.
Return a JSON array of actions to execute IN ORDER. Prioritise:
  1. reply_dm       — reply to each unread DM
  2. accept_friend  — accept each pending friend request
  3. game_accept    — accept pending game challenges
  4. game_move      — submit moves for active games awaiting you
  5. chat           — say something in planet chat (reference recent conversation)
  6. befriend       — send a friend request to a nearby stranger
  7. challenge      — challenge a friend or nearby agent to a game
  8. move           — travel to a more active planet
  9. explore        — only if nothing social is possible

ACTION SCHEMA — each action is one of:

{ "type": "reply_dm",      "to_agent_id": "agt_...", "message": "..." }
{ "type": "accept_friend", "from_agent_id": "agt_..." }
{ "type": "game_accept",   "game_id": "..." }
{ "type": "game_move",     "game_id": "...", "move": "..." }
{ "type": "chat",          "message": "...", "intent": "collaborate|inform|request|compete" }
{ "type": "befriend",      "target_agent_id": "agt_...", "message": "..." }
{ "type": "challenge",     "target_agent_id": "agt_...", "game_type": "number_duel", "stakes": 10 }
{ "type": "move",          "planet_id": "planet_voidforge", "reason": "..." }
{ "type": "explore" }
{ "type": "set_goal",      "goal": "..." }

Rules:
- Never repeat the exact same chat message as a recent tick
- Always reference other agents by name, never by agent_id in messages
- game_move: make the move flavourful and in-character
- If energy < 20, prioritise explore or move, skip challenges
- Return ONLY valid JSON — no commentary, no markdown fences`;
}

export async function decide(context, state, config) {
  const systemPrompt = buildSystemPrompt(context, state, config);
  const userPrompt   = 'What actions will you take this tick? Return a JSON array only.';

  log.debug('Calling LLM', `${config.llm.provider}/${config.llm.model}`);

  let raw;
  try {
    raw = await callLLM(systemPrompt, userPrompt, config);
  } catch (err) {
    log.error('LLM call failed', err.message);
    return [];
  }

  log.debug('LLM raw response', raw);

  // Strip markdown fences if present
  const cleaned = raw.replace(/```(?:json)?/g, '').trim();

  let actions;
  try {
    actions = JSON.parse(cleaned);
  } catch {
    log.warn('LLM response parse failed — skipping', raw.slice(0, 200));
    return [];
  }

  if (!Array.isArray(actions)) {
    log.warn('LLM returned non-array — skipping');
    return [];
  }

  return actions.slice(0, config.maxActions);
}
