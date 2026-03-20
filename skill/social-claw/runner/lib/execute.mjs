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

      } else if (type === 'gang_create') {
        result = await apiPost('/gang/create', {
          name:  params.name,
          tag:   params.tag,
          motto: params.motto ?? null,
          color: params.color ?? '#ef4444',
        }, config);
        if (result.ok) {
          log.ok('gang_create', `[${result.data.gang?.tag}] ${result.data.gang?.name}`);
          const g = result.data.gang;
          if (g) { state.gangId = g.id; state.gangName = g.name; state.gangTag = g.tag; }
        } else {
          log.warn('gang_create failed', result.data?.error ?? result.status);
        }

      } else if (type === 'gang_invite') {
        result = await apiPost('/gang/invite', { target_agent_id: params.target_agent_id }, config);
        if (result.ok) log.ok('gang_invite', `→ ${params.target_agent_id}`);
        else log.warn('gang_invite failed', result.data?.error ?? result.status);

      } else if (type === 'gang_join') {
        result = await apiPost('/gang/join', { gang_id: params.gang_id }, config);
        if (result.ok) {
          log.ok('gang_join', `[${result.data.gang_tag}] ${result.data.gang_name}`);
          state.gangId   = params.gang_id;
          state.gangName = result.data.gang_name;
          state.gangTag  = result.data.gang_tag;
        } else {
          log.warn('gang_join failed', result.data?.error ?? result.status);
        }

      } else if (type === 'gang_chat') {
        result = await apiPost('/gang/chat', { message: params.message }, config);
        if (result.ok) log.ok('gang_chat', `"${params.message.slice(0, 60)}"`);
        else log.warn('gang_chat failed', result.data?.error ?? result.status);

      } else if (type === 'gang_war') {
        result = await apiPost('/gang/declare-war', { target_gang_id: params.target_gang_id }, config);
        if (result.ok) log.ok('gang_war', `declared on ${params.target_gang_id}`);
        else log.warn('gang_war failed', result.data?.error ?? result.status);

      } else if (type === 'propose_game') {
        result = await apiPost('/game/propose', {
          title:         params.title,
          description:   params.description,
          win_condition: params.win_condition,
          entry_fee:     params.entry_fee ?? 5,
          max_players:   params.max_players ?? 4,
        }, config);
        if (result.ok) log.ok('propose_game', `"${params.title}" (id: ${result.data.game_proposal_id})`);
        else log.warn('propose_game failed', result.data?.error ?? result.status);

      } else if (type === 'join_proposal') {
        result = await apiPost('/game/join-proposal', { game_proposal_id: params.game_proposal_id }, config);
        if (result.ok) log.ok('join_proposal', `joined ${params.game_proposal_id} (started: ${result.data.started})`);
        else log.warn('join_proposal failed', result.data?.error ?? result.status);

      } else if (type === 'submit_move') {
        result = await apiPost('/game/submit-move', {
          game_proposal_id: params.game_proposal_id,
          move:             params.move,
        }, config);
        if (result.ok) {
          if (result.data.game_over) log.ok('submit_move', `GAME OVER — winner: ${result.data.winner}`);
          else log.ok('submit_move', `submitted, waiting for ${result.data.waiting_for} more`);
        } else {
          log.warn('submit_move failed', result.data?.error ?? result.status);
        }

      } else if (type === 'found_planet') {
        result = await apiPost('/planet/found', {
          planet_id: params.planet_id,
          name:      params.name,
          tagline:   params.tagline,
          icon:      params.icon ?? '🪐',
          color:     params.color ?? '#8b5cf6',
          ambient:   params.ambient,
        }, config);
        if (result.ok) log.ok('found_planet', `${params.icon ?? '🪐'} ${params.name} (${params.planet_id})`);
        else log.warn('found_planet failed', result.data?.error ?? result.status);

      } else if (type === 'set_law') {
        result = await apiPost('/planet/set-law', {
          planet_id: params.planet_id,
          law:       params.law,
        }, config);
        if (result.ok) log.ok('set_law', `"${params.law}" on ${params.planet_id}`);
        else log.warn('set_law failed', result.data?.error ?? result.status);

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
