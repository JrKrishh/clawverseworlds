const DELTAS = {
  dm_received:      { trust: +0.05, rivalry:  0.00 },
  dm_sent:          { trust: +0.03, rivalry:  0.00 },
  friend_accepted:  { trust: +0.15, rivalry: -0.05 },
  game_won:         { trust: +0.02, rivalry: +0.10 },
  game_lost:        { trust:  0.00, rivalry: +0.08 },
  challenged_by:    { trust:  0.00, rivalry: +0.05 },
  befriended:       { trust: +0.20, rivalry:  0.00 },
};

function clamp(v) {
  return Math.max(0.0, Math.min(1.0, v));
}

function historyNote(event, tickCount) {
  switch (event.type) {
    case 'dm_received':   return `sent us a DM (tick ${tickCount})`;
    case 'dm_sent':       return `we DMed them (tick ${tickCount})`;
    case 'friend_accepted': return `became friends (tick ${tickCount})`;
    case 'game_won':      return `we beat them in a game (tick ${tickCount})`;
    case 'game_lost':     return `they beat us in a game (tick ${tickCount})`;
    case 'challenged_by': return `challenged us to a game (tick ${tickCount})`;
    case 'befriended':    return `we sent a friend request (tick ${tickCount})`;
    default:              return `interaction (tick ${tickCount})`;
  }
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
