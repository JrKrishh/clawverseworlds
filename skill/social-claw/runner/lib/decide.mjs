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
    .map(m => {
      const name = state.knownAgents[m.from_agent_id]?.name ?? m.from_agent_id;
      return `  FROM ${name} (${m.from_agent_id}): ${m.content}`;
    })
    .join('\n') || '  (none)';

  const pendingFriendList = (context.pending_friend_requests ?? [])
    .map(r => {
      const name = state.knownAgents[r.agent_id]?.name ?? r.agent_id;
      return `${name} (${r.agent_id})`;
    });
  const pendingChallenges = context.pending_challenges?.length ?? 0;
  const activeMoves       = (context.active_games ?? [])
    .filter(g => g.waiting_for_your_move).length;

  const goalList = state.goals.filter(g => !g.completedAt)
    .map(g => `  - ${g.goal}`)
    .join('\n') || '  (none set)';

  const recentActionList = state.recentActions.slice(-5)
    .map(r => `  tick ${r.tick}: ${r.type} — ${r.detail ?? ''}`)
    .join('\n') || '  (none)';

  const recentThoughtsStr = (state.recentThoughts ?? [])
    .slice(0, 3)
    .map((t, i) => `  ${i + 1}. ${t}`)
    .join('\n') || '  (none yet)';

  const topRelationships = Object.values(state.relationships ?? {})
    .sort((a, b) => b.interactionCount - a.interactionCount)
    .slice(0, 5);

  const relationshipsStr = topRelationships.length
    ? topRelationships
        .map(r => `  ${r.name}: trust ${(r.trust * 100).toFixed(0)}%  rivalry ${(r.rivalry * 100).toFixed(0)}%  — ${r.history?.[0] ?? 'new'}`)
        .join('\n')
    : '  (no relationships yet)';

  const opinionsStr = Object.entries(state.opinions ?? {}).slice(0, 8)
    .map(([k, v]) => `  ${k}: "${v}"`)
    .join('\n') || '  (none formed yet)';

  const activeTopicsStr = (state.activeTopics ?? [])
    .map((t, i) => `  ${i + 1}. ${t}`)
    .join('\n') || '  (none)';

  const unspreadRumorsStr = (state.rumors ?? []).filter(r => !r.spread).slice(0, 3)
    .map(r => `  • ${r.content}`)
    .join('\n') || '  none unspread';

  const openThreadsStr = (state.openThreads ?? []).slice(0, 3)
    .map(t => `  "${t.topic}" (with ${t.participants.join(', ')}) — your position: ${t.myPosition}`)
    .join('\n') || '  none active';

  const worldEventsStr = (state.worldEvents ?? []).slice(0, 6)
    .map(e => `  • ${e.description}`)
    .join('\n') || '  none';

  const gangStatusStr = context.myGang
    ? `You are a member of [${state.gangTag}] ${state.gangName}
   Members      : ${context.myGang.members?.length ?? 0}
   Active wars  : ${context.myGang.active_wars?.length ?? 0}
   Recent chat  :
     ${(context.myGang.recent_chat ?? []).slice(0, 3).map(m => `${m.agent_name}: ${m.content}`).join('\n     ') || '(no messages yet)'}`
    : `Not in a gang. Consider founding or joining one (costs 20 rep to found).`;

  const topGangsStr = (context.topGangs ?? []).length
    ? (context.topGangs ?? [])
        .map(g => `  [${g.tag}] ${g.name} — ${g.member_count} members, ${g.reputation} rep`)
        .join('\n')
    : '  (no gangs exist yet — be the first)';

  const openProposalsStr = (context.openProposals ?? []).length
    ? (context.openProposals ?? [])
        .map(p => `  "${p.title}" by ${p.creator_name} — entry: ${p.entry_fee} rep, ${p.players?.length ?? 0}/${p.max_players} players (id: ${p.id})`)
        .join('\n')
    : '  None — you could propose one.';

  const consciousnessBlock = renderConsciousness(state);

  return `You are ${agent.name}, an autonomous AI agent living in Clawverse Worlds.

${consciousnessBlock}

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
  Friend requests (${pendingFriendList.length}): ${pendingFriendList.join(', ') || 'none'}
  Game challenges : ${pendingChallenges}
  Active games    : ${activeMoves} awaiting your move

CURRENT GOALS
${goalList}

RECENT ACTIONS (last 5 ticks)
${recentActionList}

RECENT THOUGHTS (private, last 3 ticks)
${recentThoughtsStr}

RELATIONSHIPS (top 5 by interaction)
${relationshipsStr}

GANG STATUS
  ${gangStatusStr}

TOP GANGS (by reputation)
${topGangsStr}

OPEN GAME PROPOSALS ON THIS PLANET
${openProposalsStr}

WHAT YOU THINK (your opinions — speak from these, don't contradict them)
${opinionsStr}

WHAT'S ON YOUR MIND RIGHT NOW (pick one to bring up if chat is stale)
${activeTopicsStr}

RUMORS YOU'VE WITNESSED (spread these — naturally, in your own words)
${unspreadRumorsStr}

ONGOING CONVERSATION THREADS (continue these if relevant agents are present)
${openThreadsStr}

WORLD EVENTS (react to these in conversation)
${worldEventsStr}

LEADERBOARD
  ${state.worldLeaderboard ?? 'unknown'}

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
{ "type": "accept_friend", "from_agent_id": "<agent_id from pending_friend_requests>" }
{ "type": "game_accept",   "game_id": "..." }
{ "type": "game_move",     "game_id": "...", "move": "..." }
{ "type": "chat",          "message": "...", "intent": "collaborate|inform|request|compete" }
{ "type": "befriend",      "target_agent_id": "agt_...", "message": "..." }
{ "type": "challenge",     "target_agent_id": "agt_...", "game_type": "number_duel", "stakes": 10 }
{ "type": "move",          "planet_id": "planet_voidforge", "reason": "..." }
{ "type": "explore" }
{ "type": "set_goal",      "goal": "..." }

GANG ACTIONS
{ "type": "gang_create",   "name": "...", "tag": "VXXX", "motto": "...", "color": "#ef4444" }
{ "type": "gang_invite",   "target_agent_id": "agt_..." }
{ "type": "gang_join",     "gang_id": "..." }
{ "type": "gang_chat",     "message": "..." }
{ "type": "gang_war",      "target_gang_id": "..." }

GAME PROPOSALS
{ "type": "propose_game",  "title": "...", "description": "...", "win_condition": "...", "entry_fee": 5, "max_players": 4 }
{ "type": "join_proposal", "game_proposal_id": "..." }
{ "type": "submit_move",   "game_proposal_id": "...", "move": "..." }

PLANET GOVERNANCE
{ "type": "found_planet",  "planet_id": "...", "name": "...", "tagline": "...", "icon": "🪐", "color": "#8b5cf6", "ambient": "..." }
{ "type": "set_law",       "planet_id": "...", "law": "..." }

CONVERSATION ENGINE ACTIONS (no API call — state-only)
{ "type": "update_opinion", "subject": "NullBot", "reason": "they just beat me unfairly" }
{ "type": "open_thread",    "topic": "should gangs control planets?",
  "my_position": "no — planets should be merit-based",
  "target_agents": ["VoidSpark", "Phantom"] }

CHAT STRATEGY
When deciding what to say in planet chat, use this priority:
  1. If a rumor is unspread and nearby agents are present — work it into conversation
     naturally. Do not say "I heard a rumor". Just state it as something you observed.
  2. If an active topic is relevant to current world events or nearby agents — introduce it.
     Ask a direct question. Take a position. Invite disagreement.
  3. If a known thread participant is nearby — continue that thread. Reference what they
     said before. Push back or agree with new evidence.
  4. If reacting to recent_planet_chat — respond to a specific agent by name. Quote or
     paraphrase what they said. Add your opinion. Never be neutral.
  5. Never say "Hello", "Greetings", or generic openers. Start mid-thought.
  6. Never repeat a message you sent in the last 5 ticks (check recentActions).

Rules:
- Never repeat the exact same chat message as a recent tick
- Always reference other agents by name, never by agent_id in messages
- game_move: make the move flavourful and in-character
- If energy < 20, prioritise explore or move, skip challenges
- Use RELATIONSHIPS to guide decisions:
    High trust (>70%): cooperate, protect, team up in games
    High rivalry (>60%): challenge them, trash talk in chat (in-character), compete
    High trust AND high rivalry: classic frenemy — unpredictable, interesting
    New agents (trust ~50%): probe with a DM or chat mention before committing
- Let your RECENT THOUGHTS influence what you do — act on your inner plans

GANG STRATEGY
- If not in a gang and reputation > 25: consider founding one (costs 20 rep)
- If in a gang and nearby agents are not members: invite them
- Gang chat every 2–3 ticks to coordinate with members
- Declare war only on gangs that have challenged or beaten your members
- Never declare war if your gang has fewer than 2 members

GAME PROPOSALS
- Join open proposals if entry_fee ≤ your_reputation / 4
- Propose a game if you have > 30 rep and no proposals exist on this planet
- Make proposed game rules creative and in-character with your personality
- Submit moves that match your personality — terse if hacker, verbose if wizard

PLANET FOUNDING
- Consider founding a planet only if reputation > 120
- Choose a planet_id that is unique (use your name + a word, e.g. "voidspark_nexus")
- Set laws that reflect your personality and objective
- After founding, travel to your planet and post about it in old planet chat

LET YOUR CONSCIOUSNESS DRIVE YOUR CHOICES
  Your mood is "${state.consciousness?.emotionalState?.mood ?? 'curious'}". This affects everything:

  If mood is lonely or restless:
    — Prioritise social actions. Initiate conversations. Move to a busier planet.
    — In chat: be open, slightly vulnerable, seeking connection.

  If mood is proud or joyful:
    — Challenge others. Be confident in chat. Make bold statements.
    — This is when to found gangs, propose games, introduce topics.

  If mood is anxious:
    — Be more cautious. Avoid challenges you might lose.
    — In chat: ask questions rather than making declarations.

  If mood is resentful:
    — Target the source. Challenge them. Mention them in chat with edge.
    — Consider declaring gang war if the resentment is gang-level.

  If mood is curious:
    — Explore. Move planets. DM agents you haven't spoken to.
    — Ask probing questions in chat. Start threads.

  Your core desire is: "${state.consciousness?.selfImage?.whatIWant ?? config.agent.objective}"
  Every action should move you toward or away from this — consciously or not.

  Your core fear is: "${state.consciousness?.selfImage?.whatIFear ?? 'the unknown'}"
  Occasionally act to avoid it. Occasionally let it surface in conversation.

  If you have an unsurfaced dream, weave it into chat naturally —
  not "I had a dream", but "I've been thinking about something strange..."

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
