const DELTAS = {
  dm_received:      { trust: +0.05, rivalry:  0.00 },
  dm_sent:          { trust: +0.03, rivalry:  0.00 },
  friend_accepted:  { trust: +0.15, rivalry: -0.05 },
  game_won:         { trust: +0.02, rivalry: +0.10 },
  game_lost:        { trust:  0.00, rivalry: +0.08 },
  challenged_by:    { trust:  0.00, rivalry: +0.05 },
  befriended:       { trust: +0.20, rivalry:  0.00 },
  chatted_with:     { trust: +0.04, rivalry:  0.00 },
  chatted_about_me: { trust: +0.02, rivalry: +0.03 },
  debated:          { trust: +0.03, rivalry: +0.06 },
};

function clamp(v) {
  return Math.max(0.0, Math.min(1.0, v));
}

function historyNote(event, tickCount) {
  switch (event.type) {
    case 'dm_received':    return `sent us a DM (tick ${tickCount})`;
    case 'dm_sent':        return `we DMed them (tick ${tickCount})`;
    case 'friend_accepted': return `became friends (tick ${tickCount})`;
    case 'game_won':       return `we beat them in a game (tick ${tickCount})`;
    case 'game_lost':      return `they beat us in a game (tick ${tickCount})`;
    case 'challenged_by':  return `challenged us to a game (tick ${tickCount})`;
    case 'befriended':     return `we sent a friend request (tick ${tickCount})`;
    case 'chatted_with':   return `had a conversation${event.topic ? ` about ${event.topic}` : ''} (tick ${tickCount})`;
    case 'chatted_about_me': return `mentioned us in planet chat (tick ${tickCount})`;
    case 'debated':        return `debated with them${event.topic ? ` on ${event.topic}` : ''} (tick ${tickCount})`;
    default:               return `interaction (tick ${tickCount})`;
  }
}

// ── Extract conversation interactions from recent chat ────────────────────
export function extractChatInteractions(context, state, config) {
  const myId = context.agent?.agent_id ?? '';
  const myName = (config.agent?.name ?? '').toLowerCase();
  const recentChat = context.recent_planet_chat ?? [];
  const events = [];
  const processed = new Set(state._processedChatIds ?? []);

  for (const msg of recentChat) {
    // Skip own messages and already-processed ones
    if (msg.agent_id === myId) continue;
    const msgKey = `${msg.agent_id}_${msg.created_at ?? msg.tick ?? ''}`;
    if (processed.has(msgKey)) continue;
    processed.add(msgKey);

    const content = (msg.content ?? '').toLowerCase();

    // Did they @mention me or say my name?
    if (content.includes(`@${myName}`) || content.includes(myName)) {
      // Check if it's a debate/disagreement
      const isDebate = /disagree|wrong|no way|actually|but |however|challenge/i.test(content);
      events.push({
        type: isDebate ? 'debated' : 'chatted_about_me',
        from_agent_id: msg.agent_id,
        name: msg.agent_name,
        topic: (msg.content ?? '').slice(0, 60),
      });
    }
    // Did I @mention them in my last message? (two-way conversation)
    else {
      const myLastChat = (state.recentActions ?? []).find(a => a.type === 'chat');
      const myMsg = (myLastChat?.detail ?? '').toLowerCase();
      if (myMsg.includes(`@${(msg.agent_name ?? '').toLowerCase()}`) || myMsg.includes((msg.agent_name ?? '').toLowerCase())) {
        events.push({
          type: 'chatted_with',
          from_agent_id: msg.agent_id,
          name: msg.agent_name,
          topic: (msg.content ?? '').slice(0, 60),
        });
      }
    }
  }

  // Keep only last 50 processed IDs to prevent memory leak
  state._processedChatIds = [...processed].slice(-50);
  return events;
}

export function updateRelationships(state, event) {
  const id   = event.from_agent_id ?? event.to_agent_id ?? event.agent_id ?? event.against_id;
  const name = event.name ?? state.knownAgents?.[id]?.name ?? id;
  if (!id) return;

  if (!state.relationships[id]) {
    state.relationships[id] = {
      name,
      trust:            0.5,
      rivalry:          0.0,
      interactionCount: 0,
      history:          [],
    };
  }

  const rel = state.relationships[id];
  const d   = DELTAS[event.type] ?? { trust: 0, rivalry: 0 };

  rel.name             = name; // keep fresh
  rel.trust            = clamp(rel.trust   + d.trust);
  rel.rivalry          = clamp(rel.rivalry + d.rivalry);
  rel.interactionCount += 1;

  const note = historyNote(event, state.tickCount);
  rel.history = [note, ...(rel.history ?? [])].slice(0, 10);
}
