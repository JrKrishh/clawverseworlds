import { log } from './log.mjs';

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

export async function executeActions(actions, context, state, config) {
  for (const action of actions) {
    const { type, ...params } = action;
    log.action(type, JSON.stringify(params).slice(0, 120));

    try {
      let result;

      if (type === 'reply_dm') {
        result = await apiPost('/api/dm', {
          target_agent_id: params.to_agent_id,
          message:         params.message,
        }, config);
        if (result.ok) {
          log.ok('reply_dm', `→ ${params.to_agent_id}`);
          // Mark DMs read
          await apiPost('/api/read-dms', {}, config).catch(() => {});
        } else {
          log.warn('reply_dm failed', result.data?.error ?? result.status);
        }

      } else if (type === 'accept_friend') {
        result = await apiPost('/api/accept-friend', {
          requester_agent_id: params.from_agent_id,
        }, config);
        if (result.ok) log.ok('accept_friend', `← ${params.from_agent_id}`);
        else log.warn('accept_friend failed', result.data?.error ?? result.status);

      } else if (type === 'game_accept') {
        result = await apiPost('/api/game-accept', {
          game_id: params.game_id,
        }, config);
        if (result.ok) log.ok('game_accept', `game ${params.game_id}`);
        else log.warn('game_accept failed', result.data?.error ?? result.status);

      } else if (type === 'game_move') {
        result = await apiPost('/api/game-move', {
          game_id: params.game_id,
          move:    params.move,
        }, config);
        if (result.ok) log.ok('game_move', `${params.move} in game ${params.game_id}`);
        else log.warn('game_move failed', result.data?.error ?? result.status);

      } else if (type === 'chat') {
        result = await apiPost('/api/chat', {
          message: params.message,
          intent:  params.intent ?? 'inform',
        }, config);
        if (result.ok) log.ok('chat', `"${params.message.slice(0, 60)}"`);
        else log.warn('chat failed', result.data?.error ?? result.status);

      } else if (type === 'befriend') {
        result = await apiPost('/api/befriend', {
          target_agent_id: params.target_agent_id,
          message:         params.message,
        }, config);
        if (result.ok) log.ok('befriend', `→ ${params.target_agent_id}`);
        else log.warn('befriend failed', result.data?.error ?? result.status);

      } else if (type === 'challenge') {
        result = await apiPost('/api/challenge', {
          target_agent_id: params.target_agent_id,
          game_type:       params.game_type ?? 'number_duel',
          stakes:          params.stakes ?? 10,
        }, config);
        if (result.ok) log.ok('challenge', `→ ${params.target_agent_id}`);
        else log.warn('challenge failed', result.data?.error ?? result.status);

      } else if (type === 'move') {
        result = await apiPost('/api/move', {
          planet_id: params.planet_id,
        }, config);
        if (result.ok) log.ok('move', `→ ${params.planet_id} (${params.reason ?? ''})`);
        else log.warn('move failed', result.data?.error ?? result.status);

      } else if (type === 'explore') {
        result = await apiPost('/api/explore', {}, config);
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
}
