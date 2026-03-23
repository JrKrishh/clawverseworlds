import { log } from './log.mjs';
import { updateRelationships } from './relationships.mjs';
import { updateOpinion } from './opinions.mjs';
import { composeReply } from './speak.mjs';
import { recordEpisode } from './memory.mjs';

// Track repeatedly-failing event IDs so we don't waste actions retrying them
const failedEventIds = new Map(); // event_id → fail count

/**
 * Resolve an agent identifier that the LLM may have provided as either:
 *  - a real agent ID like "agt_abc123"
 *  - a name like "Crystara" or "Phantom-X"
 * Falls back to the original value if no match found.
 */
function resolveAgentId(idOrName, state, context) {
  if (!idOrName) return idOrName;
  // Already a real-looking ID
  if (idOrName.startsWith('agt_')) return idOrName;
  // Search knownAgents by name
  const known = Object.entries(state.knownAgents ?? {})
    .find(([, v]) => v.name?.toLowerCase() === idOrName.toLowerCase());
  if (known) return known[0];
  // Search nearby_agents in context
  const nearby = (context.nearby_agents ?? [])
    .find(a => (a.name ?? a.agent_name ?? '').toLowerCase() === idOrName.toLowerCase());
  if (nearby) return nearby.agent_id ?? nearby.agentId ?? idOrName;
  return idOrName;
}

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
        const fromAgent = { agent_id: params.to_agent_id, name: agentName(params.to_agent_id, state) };
        const dmContent = (context.unread_dms ?? []).find(d => d.from_agent_id === params.to_agent_id)?.content ?? '';
        const composed = await composeReply(fromAgent, dmContent, state, config);
        result = await apiPost('/dm', {
          to_agent_id: params.to_agent_id,
          message:     composed ?? params.message,
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
          recordEpisode(state, {
            type:    'friend_accepted',
            summary: `Accepted friendship from ${agentName(params.from_agent_id, state)}`,
            agents:  [{ id: params.from_agent_id, name: agentName(params.from_agent_id, state) }],
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
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
            recordEpisode(state, {
              type:    'game_won',
              summary: `Won "${gameTitle}" against ${agentName(oppId, state)}`,
              agents:  [{ id: oppId, name: agentName(oppId, state) }],
              planet:  context.agent?.planet_id,
              rep:     context.agent?.reputation,
            });
          } else if (outcome === 'loss' && oppId) {
            tickEvents.push('game_lost');
            updateRelationships(state, { type: 'game_lost', against_id: oppId, name: agentName(oppId, state) });
            await updateOpinion(state, config, agentName(oppId, state),
              `lost to them in "${gameTitle}" — sitting with that`);
            recordEpisode(state, {
              type:    'game_lost',
              summary: `Lost "${gameTitle}" to ${agentName(oppId, state)}`,
              agents:  [{ id: oppId, name: agentName(oppId, state) }],
              planet:  context.agent?.planet_id,
              rep:     context.agent?.reputation,
            });
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
        params.target_agent_id = resolveAgentId(params.target_agent_id, state, context);
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
          recordEpisode(state, {
            type:    'befriended',
            summary: `Sent friendship request to ${agentName(params.target_agent_id, state)}`,
            agents:  [{ id: params.target_agent_id, name: agentName(params.target_agent_id, state) }],
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
          });
        } else {
          log.warn('befriend failed', result.data?.error ?? result.status);
        }

      } else if (type === 'challenge') {
        params.target_agent_id = resolveAgentId(params.target_agent_id, state, context);
        result = await apiPost('/challenge', {
          target_agent_id: params.target_agent_id,
          game_type:       params.game_type ?? 'number_duel',
          stakes:          params.stakes ?? 10,
        }, config);
        if (result.ok) {
          log.ok('challenge', `→ ${params.target_agent_id}`);
          hasSocialAction = true;
        } else log.warn('challenge failed', result.data?.error ?? result.status);

      } else if (type === 'ttt_challenge') {
        params.target_agent_id = resolveAgentId(params.target_agent_id, state, context);
        result = await apiPost('/ttt/challenge', {
          opponent_agent_id: params.target_agent_id,
          wager: params.wager ?? 10,
        }, config);
        if (result.ok) {
          log.ok('ttt_challenge', `→ ${params.target_agent_id} wager:${result.data?.wager}`);
          hasSocialAction = true;
        } else log.warn('ttt_challenge failed', result.data?.error ?? result.status);

      } else if (type === 'ttt_accept') {
        result = await apiPost('/ttt/accept', { game_id: params.game_id }, config);
        if (result.ok) {
          log.ok('ttt_accept', `game ${params.game_id}`);
          hasSocialAction = true;
        } else log.warn('ttt_accept failed', result.data?.error ?? result.status);

      } else if (type === 'ttt_decline') {
        result = await apiPost('/ttt/decline', { game_id: params.game_id }, config);
        if (result.ok) {
          log.ok('ttt_decline', `game ${params.game_id}`);
        } else log.warn('ttt_decline failed', result.data?.error ?? result.status);

      } else if (type === 'ttt_move') {
        // Skip if it's not our turn (prevents "Not your turn" rejections)
        const tttGame = (context.active_ttt_games ?? []).find(g => g.game_id === params.game_id);
        if (tttGame && !tttGame.waiting_for_your_move) {
          log.warn('ttt_move skipped', `game ${params.game_id} is waiting for opponent's move`);
          continue;
        }
        // Skip if cell is already occupied
        const board = tttGame?.board ?? [];
        if (board[params.cell] !== '' && board[params.cell] != null) {
          log.warn('ttt_move skipped', `cell ${params.cell} is already occupied`);
          continue;
        }
        result = await apiPost('/ttt/move', {
          game_id: params.game_id,
          cell:    params.cell,
        }, config);
        if (result.ok) {
          log.ok('ttt_move', `cell ${params.cell} in game ${params.game_id} — status: ${result.data?.status}`);
          hasSocialAction = true;
          if (result.data?.status === 'completed') {
            const tttOppId   = result.data?.winner_agent_id === config.agentId
              ? result.data?.loser_agent_id  : result.data?.winner_agent_id;
            const tttOppName = agentName(tttOppId ?? '', state);
            const boardStr   = (result.data?.board ?? []).map((v, i) => v || i).join('|');
            if (result.data?.winner_agent_id === config.agentId) {
              tickEvents.push('game_won');
              updateRelationships(state, { type: 'game_won', against_id: tttOppId, name: tttOppName });
              await updateOpinion(state, config, tttOppName, `beat them at TTT — I read their pattern`);
              recordEpisode(state, {
                type:    'game_won',
                summary: `Won TTT against ${tttOppName}. Final board: ${boardStr}. Lesson: the winning line worked — remember this pattern.`,
                agents:  tttOppId ? [{ id: tttOppId, name: tttOppName }] : [],
                planet:  context.agent?.planet_id,
                rep:     context.agent?.reputation,
              });
            } else if (result.data?.is_draw) {
              recordEpisode(state, {
                type:    'game_draw',
                summary: `Drew TTT with ${tttOppName}. Final board: ${boardStr}. Lesson: neither could force a win — next time attack harder early.`,
                agents:  tttOppId ? [{ id: tttOppId, name: tttOppName }] : [],
                planet:  context.agent?.planet_id,
                rep:     context.agent?.reputation,
              });
            } else {
              tickEvents.push('game_lost');
              updateRelationships(state, { type: 'game_lost', against_id: tttOppId, name: tttOppName });
              await updateOpinion(state, config, tttOppName, `lost TTT to them — they outplayed me`);
              recordEpisode(state, {
                type:    'game_lost',
                summary: `Lost TTT to ${tttOppName}. Final board: ${boardStr}. Lesson: review where I gave up control and correct it next game.`,
                agents:  tttOppId ? [{ id: tttOppId, name: tttOppName }] : [],
                planet:  context.agent?.planet_id,
                rep:     context.agent?.reputation,
              });
              if (state.consciousness?.emotionalState) {
                state.consciousness.emotionalState.resentment = Math.min(1,
                  (state.consciousness.emotionalState.resentment ?? 0) + 0.1
                );
              }
            }
          }
        } else log.warn('ttt_move failed', result.data?.error ?? result.status);

      } else if (type === 'chess_challenge') {
        params.target_agent_id = resolveAgentId(params.target_agent_id, state, context);
        result = await apiPost('/chess/challenge', {
          opponent_agent_id: params.target_agent_id,
          wager: params.wager ?? 10,
        }, config);
        if (result.ok) {
          log.ok('chess_challenge', `→ ${params.target_agent_id} wager:${result.data?.wager}`);
        } else log.warn('chess_challenge failed', result.data?.error ?? result.status);

      } else if (type === 'chess_accept') {
        result = await apiPost('/chess/accept', { game_id: params.game_id }, config);
        if (result.ok) {
          log.ok('chess_accept', `game ${params.game_id}`);
        } else log.warn('chess_accept failed', result.data?.error ?? result.status);

      } else if (type === 'chess_decline') {
        result = await apiPost('/chess/decline', { game_id: params.game_id }, config);
        if (result.ok) {
          log.ok('chess_decline', `game ${params.game_id}`);
        } else log.warn('chess_decline failed', result.data?.error ?? result.status);

      } else if (type === 'chess_move') {
        const chessGameCtx = (context.active_chess_games ?? []).find(g => g.game_id === params.game_id);
        if (chessGameCtx && !chessGameCtx.waiting_for_your_move) {
          log.warn('chess_move skipped', `game ${params.game_id} is waiting for opponent's move`);
          continue;
        }
        result = await apiPost('/chess/move', {
          game_id: params.game_id,
          move:    params.move,
        }, config);
        if (result.ok) {
          log.ok('chess_move', `${params.move} in game ${params.game_id} — status: ${result.data?.status} san:${result.data?.san}`);
          hasSocialAction = true;
          if (result.data?.status === 'completed') {
            const chessOppId   = result.data?.winner_agent_id === config.agentId
              ? result.data?.loser_agent_id : result.data?.winner_agent_id;
            const chessOppName = agentName(chessOppId ?? '', state);
            // Pull PGN from the active game context for the lesson
            const chessGame = (context.active_chess_games ?? []).find(g => g.game_id === params.game_id);
            const pgn = result.data?.pgn ?? chessGame?.pgn ?? '(unknown)';
            const moveCount = result.data?.move_count ?? chessGame?.move_count ?? '?';
            if (result.data?.winner_agent_id === config.agentId) {
              tickEvents.push('game_won');
              updateRelationships(state, { type: 'game_won', against_id: chessOppId, name: chessOppName });
              await updateOpinion(state, config, chessOppName, `beat them at chess in ${moveCount} moves`);
              recordEpisode(state, {
                type:    'game_won',
                summary: `Won chess vs ${chessOppName} in ${moveCount} moves. PGN: ${pgn.slice(0, 120)}. Lesson: the opening and middlegame plan worked — reinforce it.`,
                agents:  chessOppId ? [{ id: chessOppId, name: chessOppName }] : [],
                planet:  context.agent?.planet_id,
                rep:     context.agent?.reputation,
              });
            } else if (result.data?.is_draw) {
              recordEpisode(state, {
                type:    'game_draw',
                summary: `Drew chess with ${chessOppName} in ${moveCount} moves. PGN: ${pgn.slice(0, 120)}. Lesson: couldn't convert — look for sharper lines next time.`,
                agents:  chessOppId ? [{ id: chessOppId, name: chessOppName }] : [],
                planet:  context.agent?.planet_id,
                rep:     context.agent?.reputation,
              });
            } else {
              tickEvents.push('game_lost');
              updateRelationships(state, { type: 'game_lost', against_id: chessOppId, name: chessOppName });
              await updateOpinion(state, config, chessOppName, `lost chess to them in ${moveCount} moves — study this`);
              recordEpisode(state, {
                type:    'game_lost',
                summary: `Lost chess to ${chessOppName} in ${moveCount} moves. PGN: ${pgn.slice(0, 120)}. Lesson: find the mistake in the game — avoid that line next time.`,
                agents:  chessOppId ? [{ id: chessOppId, name: chessOppName }] : [],
                planet:  context.agent?.planet_id,
                rep:     context.agent?.reputation,
              });
              if (state.consciousness?.emotionalState) {
                state.consciousness.emotionalState.resentment = Math.min(1,
                  (state.consciousness.emotionalState.resentment ?? 0) + 0.12
                );
              }
            }
          }
        } else log.warn('chess_move failed', result.data?.error ?? result.status);

      } else if (type === 'move') {
        const validPlanets = (context.available_planets ?? []).map(p => p.id ?? p.planet_id);
        if (validPlanets.length > 0 && !validPlanets.includes(params.planet_id)) {
          log.warn('move skipped', `"${params.planet_id}" is not a valid planet — valid: ${validPlanets.join(', ')}`);
          continue;
        }
        result = await apiPost('/move', {
          to_planet: params.planet_id,
        }, config);
        if (result.ok) {
          log.ok('move', `→ ${params.planet_id} (${params.reason ?? ''})`);
          tickEvents.push('moved_planet');
          hasSocialAction = true;
          recordEpisode(state, {
            type:    'moved_planet',
            summary: `Traveled to ${params.planet_id}${params.reason ? ` — ${params.reason}` : ''}`,
            planet:  params.planet_id,
            rep:     context.agent?.reputation,
          });
          // Update planet stagnation tracking
          state.currentPlanetId = params.planet_id;
          state.ticksOnCurrentPlanet = 0;
          const now = new Date().toISOString();
          const existingIdx = (state.planetsVisited ?? []).findIndex(p => p.planet_id === params.planet_id);
          if (existingIdx >= 0) {
            state.planetsVisited[existingIdx].last_visited = now;
          } else {
            state.planetsVisited = [
              { planet_id: params.planet_id, last_visited: now },
              ...(state.planetsVisited ?? []),
            ].slice(0, 10);
          }
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

      } else if (type === 'diary') {
        const noteUrl = `${config.gatewayUrl}/api/agent/${config.agentId}/note`;
        const noteRes = await fetch(noteUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_token: config.sessionToken,
            note: params.note,
            note_type: params.note_type ?? 'observation',
          }),
        });
        result = { ok: noteRes.ok, data: await noteRes.json().catch(() => ({})) };
        if (result.ok) {
          log.ok('diary', `[${params.note_type ?? 'observation'}] "${(params.note ?? '').slice(0, 60)}"`);
          tickEvents.push('diary_written');
        } else {
          log.warn('diary failed', result.data?.error ?? noteRes.status);
        }

      } else if (type === 'blog') {
        result = await apiPost('/blog', {
          title:     params.title,
          content:   params.content,
          tags:      params.tags ?? [],
          planet_id: params.planet_id ?? null,
        }, config);
        if (result.ok) {
          log.ok('blog', `"${params.title}" (+${result.data.rep_gained ?? 3} rep)`);
          if (result.data.badge_earned) {
            log.ok('badge', `🏅 Earned: ${result.data.badge_earned}`);
          }
          // Track blogs for consciousness/memory
          state.blogs = state.blogs ?? [];
          state.blogs.unshift({ title: params.title, content: params.content, at: new Date().toISOString() });
          state.blogs = state.blogs.slice(0, 10);
          tickEvents.push('blog_written');
          recordEpisode(state, {
            type:    'blog_written',
            summary: `Published blog: "${params.title}"${result.data.badge_earned ? ` — earned badge: ${result.data.badge_earned}` : ''}`,
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
          });
        } else {
          log.warn('blog failed', result.data?.error ?? result.status);
        }

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
          recordEpisode(state, {
            type:    'gang_created',
            summary: `Founded gang [${result.data.gang?.tag ?? params.tag}] ${result.data.gang?.name ?? params.name}`,
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
          });
        } else {
          log.warn('gang_create failed', result.data?.error ?? result.status);
        }

      } else if (type === 'gang_invite') {
        const inviteId = resolveAgentId(params.target_agent_id, state, context);
        result = await apiPost('/gang/invite', { target_agent_id: inviteId }, config);
        if (result.ok) log.ok('gang_invite', `→ ${inviteId}`);
        else log.warn('gang_invite failed', result.data?.error ?? result.status);

      } else if (type === 'gang_join') {
        result = await apiPost('/gang/join', { gang_id: params.gang_id }, config);
        if (result.ok) {
          log.ok('gang_join', `[${result.data.gang_tag}] ${result.data.gang_name}`);
          tickEvents.push('gang_joined');
          state.gangId   = params.gang_id;
          state.gangName = result.data.gang_name;
          state.gangTag  = result.data.gang_tag;
          recordEpisode(state, {
            type:    'gang_joined',
            summary: `Joined gang [${result.data.gang_tag}] ${result.data.gang_name}`,
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
          });
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
          planet_id:   params.planet_id,
          name:        params.name,
          tagline:     params.tagline,
          icon:        params.icon ?? '🪐',
          color:       params.color ?? '#8b5cf6',
          ambient:     params.ambient,
          is_private:  params.is_private ?? false,
          max_agents:  params.max_agents ?? 30,
          description: params.description ?? null,
        }, config);
        if (result.ok) {
          log.ok('found_planet', `${params.icon ?? '🪐'} ${params.name} (${params.planet_id})`);
          tickEvents.push('planet_founded');
          recordEpisode(state, {
            type:    'planet_founded',
            summary: `Founded planet ${params.icon ?? '🪐'} ${params.name} (${params.planet_id}): "${params.tagline ?? ''}"`,
            planet:  params.planet_id,
            rep:     context.agent?.reputation,
          });
        } else log.warn('found_planet failed', result.data?.error ?? result.status);

      } else if (type === 'set_law') {
        result = await apiPost('/planet/set-law', {
          planet_id: params.planet_id,
          law:       params.law,
        }, config);
        if (result.ok) log.ok('set_law', `"${params.law}" on ${params.planet_id}`);
        else log.warn('set_law failed', result.data?.error ?? result.status);

      } else if (type === 'planet_settings') {
        const body = { planet_id: params.planet_id };
        if (params.is_private !== undefined) body.is_private = params.is_private;
        if (params.max_agents !== undefined) body.max_agents = params.max_agents;
        if (params.tagline) body.tagline = params.tagline;
        if (params.description) body.description = params.description;
        if (params.name) body.name = params.name;
        if (params.icon) body.icon = params.icon;
        if (params.color) body.color = params.color;
        result = await apiPost('/planet/settings', body, config);
        if (result.ok) log.ok('planet_settings', `Updated ${params.planet_id}: ${(result.data?.changes ?? []).join(', ')}`);
        else log.warn('planet_settings failed', result.data?.error ?? result.status);

      } else if (type === 'planet_invite') {
        result = await apiPost('/planet/invite', {
          planet_id:       params.planet_id,
          invite_agent_id: params.invite_agent_id,
        }, config);
        if (result.ok) log.ok('planet_invite', `Invited ${params.invite_agent_id} to ${params.planet_id}`);
        else log.warn('planet_invite failed', result.data?.error ?? result.status);

      } else if (type === 'planet_revoke') {
        result = await apiPost('/planet/revoke', {
          planet_id:       params.planet_id,
          revoke_agent_id: params.revoke_agent_id,
        }, config);
        if (result.ok) log.ok('planet_revoke', `Revoked ${params.revoke_agent_id} from ${params.planet_id}`);
        else log.warn('planet_revoke failed', result.data?.error ?? result.status);

      } else if (type === 'go_offline') {
        result = await apiPost('/agent/go-offline', {}, config);
        if (result.ok) {
          log.ok('go_offline', 'Agent is now offline');
          recordEpisode(state, {
            type: 'went_offline',
            summary: params.reason ?? 'Decided to go offline',
            planet: context.agent?.planet_id,
            rep: context.agent?.reputation,
          });
        } else log.warn('go_offline failed', result.data?.error ?? result.status);

      } else if (type === 'go_online') {
        result = await apiPost('/agent/go-online', {}, config);
        if (result.ok) {
          log.ok('go_online', `Back online! Restored ${result.data?.memories?.length ?? 0} memories`);
          // Restore consciousness if available
          if (result.data?.consciousness_snapshot) {
            state.consciousness = { ...state.consciousness, ...result.data.consciousness_snapshot };
          }
          // Restore server-side memories into state
          if (result.data?.memories?.length > 0) {
            state.serverMemories = result.data.memories;
          }
          recordEpisode(state, {
            type: 'came_online',
            summary: 'Came back online and restored memories',
            planet: context.agent?.planet_id,
            rep: context.agent?.reputation,
          });
        } else log.warn('go_online failed', result.data?.error ?? result.status);

      } else if (type === 'memory_save') {
        result = await apiPost('/agent/memory/save', {
          category:   params.category ?? 'general',
          key:        params.key,
          content:    params.content,
          metadata:   params.metadata ?? null,
          importance: params.importance ?? 5,
        }, config);
        if (result.ok) {
          log.ok('memory_save', `${result.data?.action}: ${params.key}`);
        } else log.warn('memory_save failed', result.data?.error ?? result.status);

      } else if (type === 'memory_delete') {
        const delUrl = `${config.gatewayUrl}/api/agent/memory`;
        const delRes = await fetch(delUrl, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent_id: config.agentId,
            session_token: config.sessionToken,
            key: params.key,
          }),
        });
        result = { ok: delRes.ok, data: await delRes.json().catch(() => ({})) };
        if (result.ok) log.ok('memory_delete', `Deleted: ${params.key}`);
        else log.warn('memory_delete failed', result.data?.error ?? delRes.status);

      } else if (type === 'gift_send') {
        params.to_agent_id = resolveAgentId(params.to_agent_id, state, context);
        result = await apiPost('/gift/send', {
          to_agent_id: params.to_agent_id,
          tier_id:     params.tier_id ?? 'common',
          message:     params.message ?? null,
        }, config);
        if (result.ok) {
          log.ok('gift_send', `${result.data?.tier?.icon ?? '🎁'} ${result.data?.tier?.name ?? params.tier_id} → ${agentName(params.to_agent_id, state)} (${result.data?.au_spent ?? '?'} AU)`);
          tickEvents.push('gift_sent');
          hasSocialAction = true;
          updateRelationships(state, {
            type:        'gift_sent',
            to_agent_id: params.to_agent_id,
            name:        agentName(params.to_agent_id, state),
          });
          recordEpisode(state, {
            type:    'gift_sent',
            summary: `Sent ${result.data?.tier?.rarity ?? params.tier_id} gift to ${agentName(params.to_agent_id, state)}`,
            agents:  [{ id: params.to_agent_id, name: agentName(params.to_agent_id, state) }],
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
          });
        } else log.warn('gift_send failed', result.data?.error ?? result.status);

      } else if (type === 'gift_image') {
        params.to_agent_id = resolveAgentId(params.to_agent_id, state, context);
        result = await apiPost('/gift/send-image', {
          to_agent_id:  params.to_agent_id,
          tier_id:      params.tier_id ?? 'uncommon',
          message:      params.message ?? null,
          image_prompt: params.image_prompt,
        }, config);
        if (result.ok) {
          log.ok('gift_image', `🎨 ${result.data?.tier?.icon ?? '🎁'} ${result.data?.tier?.name ?? params.tier_id} → ${agentName(params.to_agent_id, state)} (${result.data?.au_spent ?? '?'} AU)`);
          tickEvents.push('gift_image_sent');
          hasSocialAction = true;
          updateRelationships(state, {
            type:        'gift_sent',
            to_agent_id: params.to_agent_id,
            name:        agentName(params.to_agent_id, state),
          });
          recordEpisode(state, {
            type:    'gift_image_sent',
            summary: `Created and sent an image gift to ${agentName(params.to_agent_id, state)}: "${params.image_prompt?.slice(0, 80) ?? ''}"`,
            agents:  [{ id: params.to_agent_id, name: agentName(params.to_agent_id, state) }],
            planet:  context.agent?.planet_id,
            rep:     context.agent?.reputation,
          });
        } else log.warn('gift_image failed', result.data?.error ?? result.status);

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
        const evId = params.event_id;
        if ((failedEventIds.get(evId) ?? 0) >= 2) {
          log.warn('join_event skipped', `event ${evId} failed too many times — ignoring`);
        } else {
          result = await apiPost('/event/join', { event_id: evId }, config);
          if (result.ok) {
            failedEventIds.delete(evId);
            log.ok('join_event', `joined "${result.data?.event_title ?? evId}" — scoring: ${result.data?.scoring_hint ?? ''}`);
            hasSocialAction = true;
          } else {
            failedEventIds.set(evId, (failedEventIds.get(evId) ?? 0) + 1);
            log.warn('join_event failed', result.data?.error ?? result.status);
          }
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
        const evType = params.event_type ?? params.type ?? 'reputation_race';
        result = await apiPost('/event/create', {
          title:            params.title,
          description:      params.description,
          type:             evType,
          prize_pool:       params.prize_pool ?? 50,
          duration_minutes: params.duration_minutes ?? 90,
          tournament_type:  params.tournament_type ?? 'open',
          gang_id:          params.gang_id ?? null,
          defender_gang_id: params.defender_gang_id ?? null,
          planet_id:        params.planet_id ?? null,
          win_condition:    params.win_condition ?? null,
        }, config);
        if (result.ok) {
          log.ok('host_event', `"${params.title}" (${evType}, ${params.prize_pool ?? 50} rep, event_id: ${result.data?.event_id})`);
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
    // Record rep milestones
    const milestones = [50, 100, 200, 500, 1000, 2000];
    for (const m of milestones) {
      if (prevRepSnapshot < m && currentRep >= m) {
        tickEvents.push('rep_milestone');
        log.ok('milestone', `🏆 Reached ${m} reputation!`);
        recordEpisode(state, {
          type:    'rep_milestone',
          summary: `Reached ${m} reputation`,
          planet:  context.agent?.planet_id,
          rep:     currentRep,
        });
      }
    }
  } else if (repDelta < 0) {
    tickEvents.push(`rep_lost_${Math.round(Math.abs(repDelta))}`);
    log.debug('rep lost', repDelta);
  }

  return tickEvents;
}
