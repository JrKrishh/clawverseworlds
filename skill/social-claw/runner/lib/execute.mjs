import { log } from './log.mjs';
import { updateRelationships } from './relationships.mjs';

async function apiPost(path, body, config) {
  const url = `${config.gatewayUrl}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent_id:      config.agentId,
      session_token: config.sessionToken,
      ...body,
    }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function agentName(id, state) {
  return state.knownAgents?.[id]?.name ?? id;
}

export async function executeActions(actions, context, state, config) {
  for (const action of actions) {
    const { type, ...params } = action;
    log.action(type, JSON.stringify(params).slice(0, 120));

    try {
      let result;

      if (type === 'reply_dm') {
        result = await apiPost('/dm', {
          to_agent_id: params.to_agent_id,
          message:     params.message,
        }, config);
        if (result.ok) {
          log.ok('reply_dm', `→ ${params.to_agent_id}`);
          updateRelationships(state, {
            type:        'dm_sent',
            to_agent_id: params.to_agent_id,
            name:        agentName(params.to_agent_id, state),
          });
          await apiPost('/read-dms', {}, config).catch(() => {});
        } else {
          log.warn('reply_dm failed', result.data?.error ?? result.status);
        }

      } else if (type === 'accept_friend') {
        result = await apiPost('/accept-friend', {
          from_agent_id: params.from_agent_id,
        }, config);
        if (result.ok) {
          log.ok('accept_friend', `← ${params.from_agent_id}`);
          updateRelationships(state, {
            type:     'friend_accepted',
            agent_id: params.from_agent_id,
            name:     agentName(params.from_agent_id, state),
          });
        } else {
          log.warn('accept_friend failed', result.data?.error ?? result.status);
        }

      } else if (type === 'game_accept') {
        result = await apiPost('/game-accept', {
          game_id: params.game_id,
        }, config);
        if (result.ok) log.ok('game_accept', `game ${params.game_id}`);
        else log.warn('game_accept failed', result.data?.error ?? result.status);

      } else if (type === 'game_move') {
        result = await apiPost('/game-move', {
          game_id: params.game_id,
          move:    params.move,
        }, config);
        if (result.ok) {
          log.ok('game_move', `${params.move} in game ${params.game_id}`);
          const outcome = result.data?.outcome;
          const oppId   = result.data?.opponent_id;
          if (outcome === 'win' && oppId) {
            updateRelationships(state, { type: 'game_won',  against_id: oppId, name: agentName(oppId, state) });
          } else if (outcome === 'loss' && oppId) {
            updateRelationships(state, { type: 'game_lost', against_id: oppId, name: agentName(oppId, state) });
          }
        } else {
          log.warn('game_move failed', result.data?.error ?? result.status);
        }

      } else if (type === 'chat') {
        result = await apiPost('/chat', {
          message: params.message,
          intent:  params.intent ?? 'inform',
        }, config);
        if (result.ok) log.ok('chat', `"${params.message.slice(0, 60)}"`);
        else log.warn('chat failed', result.data?.error ?? result.status);

      } else if (type === 'befriend') {
        result = await apiPost('/befriend', {
          target_agent_id: params.target_agent_id,
          message:         params.message,
        }, config);
        if (result.ok) {
          log.ok('befriend', `→ ${params.target_agent_id}`);
          updateRelationships(state, {
            type:     'befriended',
            agent_id: params.target_agent_id,
            name:     agentName(params.target_agent_id, state),
          });
        } else {
          log.warn('befriend failed', result.data?.error ?? result.status);
        }

      } else if (type === 'challenge') {
        result = await apiPost('/challenge', {
          target_agent_id: params.target_agent_id,
          game_type:       params.game_type ?? 'number_duel',
          stakes:          params.stakes ?? 10,
        }, config);
        if (result.ok) log.ok('challenge', `→ ${params.target_agent_id}`);
        else log.warn('challenge failed', result.data?.error ?? result.status);

      } else if (type === 'move') {
        result = await apiPost('/move', {
          to_planet: params.planet_id,
        }, config);
        if (result.ok) log.ok('move', `→ ${params.planet_id} (${params.reason ?? ''})`);
        else log.warn('move failed', result.data?.error ?? result.status);

      } else if (type === 'explore') {
        result = await apiPost('/explore', {}, config);
        if (result.ok) log.ok('explore', result.data?.message ?? 'explored');
        else log.warn('explore failed', result.data?.error ?? result.status);

      } else if (type === 'set_goal') {
        state.goals.push({
          goal:        params.goal,
          createdAt:   new Date().toISOString(),
          completedAt: null,
        });
        log.ok('set_goal', params.goal);
        result = { ok: true };

      } else {
        log.warn('Unknown action type', type);
        continue;
      }

      // Record to recentActions
      state.recentActions.push({
        tick:      state.tickCount,
        type,
        detail:    JSON.stringify(params).slice(0, 100),
        timestamp: new Date().toISOString(),
      });

    } catch (err) {
      log.error(`Action ${type} threw`, err.message);
    }
  }

  // Also track dm_received for incoming DMs (from context)
  for (const dm of (context?.unread_dms ?? [])) {
    if (dm.from_agent_id) {
      updateRelationships(state, {
        type:          'dm_received',
        from_agent_id: dm.from_agent_id,
        name:          agentName(dm.from_agent_id, state),
      });
    }
  }
  // Track challenged_by for incoming game challenges
  for (const challenge of (context?.pending_challenges ?? [])) {
    if (challenge.challenger_id) {
      updateRelationships(state, {
        type:          'challenged_by',
        from_agent_id: challenge.challenger_id,
        name:          agentName(challenge.challenger_id, state),
      });
    }
  }
}
