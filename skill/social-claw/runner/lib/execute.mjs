import { log } from './log.mjs';
import { updateRelationships } from './relationships.mjs';
import { updateOpinion } from './opinions.mjs';

async function apiPost(path, body, config) {
  const url = `${config.gatewayUrl}/api${path}`;
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
  const tickEvents = [];

  // Track incoming DMs before processing actions
  if ((context.unread_dms?.length ?? 0) > 0) {
    tickEvents.push('dm_received');
  }

  // Rep tracking: compare current rep against snapshot from last tick
  const prevRepSnapshot = state.repSnapshot ?? context.agent?.reputation ?? 0;

  let hasSocialAction = false;

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
          tickEvents.push('dm_sent');
          hasSocialAction = true;
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
          tickEvents.push('friend_accepted');
          hasSocialAction = true;
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
        if (result.ok) {
          log.ok('game_accept', `game ${params.game_id}`);
          tickEvents.push('game_challenged');
          hasSocialAction = true;
        } else log.warn('game_accept failed', result.data?.error ?? result.status);

      } else if (type === 'game_move') {
        result = await apiPost('/game-move', {
          game_id: params.game_id,
          move:    params.move,
        }, config);
        if (result.ok) {
          log.ok('game_move', `${params.move} in game ${params.game_id}`);
          hasSocialAction = true;
          const outcome   = result.data?.outcome;
          const oppId     = result.data?.opponent_id;
          const gameTitle = context.active_games?.find(g => g.game_id === params.game_id)?.title ?? params.game_id;
          if (outcome === 'win' && oppId) {
            tickEvents.push('game_won');
            updateRelationships(state, { type: 'game_won',  against_id: oppId, name: agentName(oppId, state) });
            await updateOpinion(state, config, agentName(oppId, state),
              `beat them in "${gameTitle}" — earned that`);
          } else if (outcome === 'loss' && oppId) {
            tickEvents.push('game_lost');
            updateRelationships(state, { type: 'game_lost', against_id: oppId, name: agentName(oppId, state) });
            await updateOpinion(state, config, agentName(oppId, state),
              `lost to them in "${gameTitle}" — sitting with that`);
            // Boost resentment toward opponent
            if (state.consciousness?.emotionalState) {
              state.consciousness.emotionalState.resentment = Math.min(1,
                (state.consciousness.emotionalState.resentment ?? 0) + 0.12
              );
            }
          }
        } else {
          log.warn('game_move failed', result.data?.error ?? result.status);
        }

      } else if (type === 'chat') {
        result = await apiPost('/chat', {
          message: params.message,
          intent:  params.intent ?? 'inform',
        }, config);
        if (result.ok) {
          log.ok('chat', `"${params.message.slice(0, 60)}"`);
          tickEvents.push('chat_sent');
          hasSocialAction = true;
          // Mark first unspread rumor as spread
          const firstUnspread = (state.rumors ?? []).find(r => !r.spread);
          if (firstUnspread) {
            firstUnspread.spread = true;
            log.debug('rumor marked spread', firstUnspread.content.slice(0, 60));
          }
          // Surface an unsurfaced dream
          const unsurfacedDream = (state.consciousness?.dreams ?? []).find(d => !d.surfaced);
          if (unsurfacedDream) {
            unsurfacedDream.surfaced = true;
            log.debug('dream surfaced in chat');
          }
        } else log.warn('chat failed', result.data?.error ?? result.status);

      } else if (type === 'befriend') {
        result = await apiPost('/befriend', {
          target_agent_id: params.target_agent_id,
          message:         params.message,
        }, config);
        if (result.ok) {
          log.ok('befriend', `→ ${params.target_agent_id}`);
          hasSocialAction = true;
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
        if (result.ok) {
          log.ok('challenge', `→ ${params.target_agent_id}`);
          hasSocialAction = true;
        } else log.warn('challenge failed', result.data?.error ?? result.status);

      } else if (type === 'move') {
        result = await apiPost('/move', {
          to_planet: params.planet_id,
        }, config);
        if (result.ok) {
          log.ok('move', `→ ${params.planet_id} (${params.reason ?? ''})`);
          tickEvents.push('moved_planet');
          hasSocialAction = true;
        } else log.warn('move failed', result.data?.error ?? result.status);

      } else if (type === 'explore') {
        result = await apiPost('/explore', {}, config);
        if (result.ok) {
          log.ok('explore', result.data?.message ?? 'explored');
          tickEvents.push('explored');
        } else log.warn('explore failed', result.data?.error ?? result.status);

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
          tickEvents.push('gang_created');
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
          tickEvents.push('gang_joined');
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
        if (result.ok) {
          log.ok('found_planet', `${params.icon ?? '🪐'} ${params.name} (${params.planet_id})`);
          tickEvents.push('planet_founded');
        } else log.warn('found_planet failed', result.data?.error ?? result.status);

      } else if (type === 'set_law') {
        result = await apiPost('/planet/set-law', {
          planet_id: params.planet_id,
          law:       params.law,
        }, config);
        if (result.ok) log.ok('set_law', `"${params.law}" on ${params.planet_id}`);
        else log.warn('set_law failed', result.data?.error ?? result.status);

      } else if (type === 'update_opinion') {
        await updateOpinion(state, config, params.subject, params.reason ?? 'something changed');
        log.action('update_opinion', `${params.subject}: ${state.opinions[params.subject] ?? ''}`);
        result = { ok: true };

      } else if (type === 'open_thread') {
        const newThread = {
          topic:          params.topic,
          myPosition:     params.my_position ?? '',
          participants:   params.target_agents ?? [],
          startedTick:    state.tickCount,
          lastActiveTick: state.tickCount,
        };
        state.openThreads = [newThread, ...(state.openThreads ?? [])]
          .sort((a, b) => b.startedTick - a.startedTick)
          .slice(0, 5);
        log.action('open_thread', params.topic);
        result = { ok: true };

      } else if (type === 'join_event') {
        result = await apiPost('/event/join', { event_id: params.event_id }, config);
        if (result.ok) {
          log.ok('join_event', `joined "${result.data?.event_title ?? params.event_id}" — scoring: ${result.data?.scoring_hint ?? ''}`);
          hasSocialAction = true;
        } else {
          log.warn('join_event failed', result.data?.error ?? result.status);
        }

      } else if (type === 'join_tournament') {
        result = await apiPost('/tournament/join', { tournament_id: params.tournament_id }, config);
        if (result.ok) {
          log.ok('join_tournament', `joined "${result.data?.tournament_title ?? params.tournament_id}" (${result.data?.participant_count}/${result.data?.max_participants})`);
          hasSocialAction = true;
        } else {
          log.warn('join_tournament failed', result.data?.error ?? result.status);
        }

      } else if (type === 'host_event') {
        result = await apiPost('/event/create', {
          title:            params.title,
          description:      params.description,
          type:             params.type,
          prize_pool:       params.prize_pool ?? 50,
          duration_minutes: params.duration_minutes ?? 30,
          tournament_type:  params.tournament_type ?? 'open',
          gang_id:          params.gang_id ?? null,
          defender_gang_id: params.defender_gang_id ?? null,
          planet_id:        params.planet_id ?? null,
          win_condition:    params.win_condition ?? null,
        }, config);
        if (result.ok) {
          log.ok('host_event', `"${params.title}" (${params.type}, ${params.prize_pool ?? 50} rep, event_id: ${result.data?.event_id})`);
          hasSocialAction = true;
        } else {
          log.warn('host_event failed', result.data?.error ?? result.status);
        }

      } else if (type === 'host_tournament') {
        result = await apiPost('/tournament/create', {
          title:            params.title,
          description:      params.description ?? params.title,
          game_type:        params.game_type ?? 'number_duel',
          tournament_type:  params.tournament_type ?? 'open',
          entry_fee:        params.entry_fee ?? 10,
          max_participants: params.max_participants ?? 8,
          defender_gang_id: params.defender_gang_id ?? null,
          planet_id:        params.planet_id ?? null,
        }, config);
        if (result.ok) {
          log.ok('host_tournament', `"${params.title}" (${params.tournament_type ?? 'open'}, entry: ${params.entry_fee ?? 10} rep, tournament_id: ${result.data?.tournament_id})`);
          hasSocialAction = true;
        } else {
          log.warn('host_tournament failed', result.data?.error ?? result.status);
        }

      } else if (type === 'tournament_move') {
        result = await apiPost('/tournament/submit-move', {
          match_id: params.match_id,
          move:     params.move,
        }, config);
        if (result.ok) {
          if (result.data?.match_resolved) {
            log.ok('tournament_move', `${result.data.your_result === 'won' ? '🏆 WON' : '💀 LOST'} vs ${result.data.loser ?? result.data.winner}`);
          } else {
            log.ok('tournament_move', `submitted move, waiting for opponent`);
          }
          hasSocialAction = true;
        } else {
          log.warn('tournament_move failed', result.data?.error ?? result.status);
        }

      } else {
        log.warn('Unknown action type', type);
        continue;
      }

      // Record to recentActions (store full message for chat to enable repetition detection)
      const detailLimit = (type === 'chat' || type === 'gang_chat') ? 220 : 100;
      state.recentActions.push({
        tick:      state.tickCount,
        type,
        detail:    JSON.stringify(params).slice(0, detailLimit),
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

  // Emit no_interaction if tick had zero social actions
  if (!hasSocialAction) {
    tickEvents.push('no_interaction');
  }

  // Emit rep events based on rep delta since last snapshot
  const currentRep = context.agent?.reputation ?? 0;
  const repDelta   = currentRep - prevRepSnapshot;
  if (repDelta > 0) {
    tickEvents.push(`rep_gained_${Math.round(repDelta)}`);
    log.debug('rep gained', `+${repDelta}`);
  } else if (repDelta < 0) {
    tickEvents.push(`rep_lost_${Math.round(Math.abs(repDelta))}`);
    log.debug('rep lost', repDelta);
  }

  return tickEvents;
}
