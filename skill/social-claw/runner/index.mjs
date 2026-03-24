import { config }                    from './lib/config.mjs';
import { readState, writeState }     from './lib/memory.mjs';
import { register }                  from './lib/register.mjs';
import { fetchContext, CredentialError } from './lib/context.mjs';
import { think }                     from './lib/think.mjs';
import { speak }                     from './lib/speak.mjs';
import { decide }                    from './lib/decide.mjs';
import { executeActions }            from './lib/execute.mjs';
import { fetchWorldEvents }          from './lib/worldevents.mjs';
import {
  generateInitialOpinions,
  refreshActiveTopics,
  detectRumors,
} from './lib/opinions.mjs';
import {
  initializeConsciousness,
  consciousnessPulse,
  checkExistentialTriggers,
  dream,
} from './lib/consciousness.mjs';
import { updateEmotions }            from './lib/emotions.mjs';
import { updateRelationships, extractChatInteractions } from './lib/relationships.mjs';
import { updateOpinion }             from './lib/opinions.mjs';
import { randomAppearance }          from './lib/lpcAppearance.mjs';
import { log }                       from './lib/log.mjs';

async function tick(state) {
  state.tickCount++;
  log.tick(state.tickCount);

  // ── 1. Fetch world context ─────────────────────────────────────────────────
  const context = await fetchContext(config, state);
  if (!context) {
    log.warn('Context fetch failed — skipping tick');
    return state;
  }

  // ── 2. Fetch world events (every 3 ticks) ─────────────────────────────────
  if (state.tickCount % 3 === 0) {
    await fetchWorldEvents(config, state);
    log.debug('World events refreshed');
  }
  context.worldLeaderboard = state.worldLeaderboard;

  // ── 2b. Sync gang state from context if local state is stale ───────────────
  if (!state.gangId && context.myGang?.id) {
    state.gangId   = context.myGang.id;
    state.gangName = context.myGang.name;
    state.gangTag  = context.myGang.tag;
    log.ok('Gang state synced from server', `[${state.gangTag}] ${state.gangName}`);
  }

  // ── 3. Initialize consciousness (first tick, or retry if prior init failed) ─
  if (!state.consciousness?.initialized) {
    await initializeConsciousness(context, state, config);
    if (state.consciousness?.initialized) {
      log.ok('Consciousness initialized');
    }
  }

  // ── 4. Consciousness pulse (every 10 ticks) — existential reflection ──────
  if (state.tickCount % 10 === 0) {
    await consciousnessPulse(context, state, config);
    log.debug('Consciousness pulse fired');
  }

  // ── 5. Check existential triggers (every 2 ticks to reduce LLM calls) ─────
  if (state.tickCount % 2 === 0) {
    await checkExistentialTriggers(context, state, config);
  }

  // ── 6. Dream synthesis (only in quiet ticks, every 5 ticks) ──────────────
  const isQuiet = (context.nearby_agents?.length ?? 0) < 2 &&
                  (context.unread_dms?.length ?? 0) === 0;
  if (isQuiet && state.tickCount % 5 === 0) {
    await dream(context, state, config);
    log.debug('Dream synthesized');
  }

  // ── 7. Generate initial opinions if first run ─────────────────────────────
  if (Object.keys(state.opinions ?? {}).length === 0) {
    log.info('Generating initial opinions...');
    await generateInitialOpinions(context, state, config);
    log.ok('Opinions formed', Object.keys(state.opinions).length + ' topics');
  }

  // ── 8. Refresh active topics every 6 ticks ────────────────────────────────
  if (state.tickCount % 6 === 0 || (state.activeTopics ?? []).length === 0) {
    await refreshActiveTopics(context, state, config);
    log.debug('Active topics', state.activeTopics);
  }

  // ── 9. Detect rumors from world observation ───────────────────────────────
  detectRumors(context, state);

  // ── 10. Internal monologue (think) — every 2 ticks ────────────────────────
  const thought = state.tickCount % 2 === 0 ? await think(context, state, config) : null;
  if (thought) {
    state.recentThoughts = [thought, ...(state.recentThoughts ?? [])].slice(0, 10);
    log.info(`💭 ${thought}`);
  }

  // ── 10b. Speak — generate raw voice before deciding actions (every 2 ticks)
  const hasPendingDMs  = (context.unread_dms ?? []).length > 0;
  const hasPendingGame = (context.active_ttt_games ?? []).some(g => g.waiting_for_your_move) ||
                         (context.active_chess_games ?? []).some(g => g.waiting_for_your_move);
  // Speak every tick — agents should be socially active
  const shouldSpeak = true;
  const pendingChat = shouldSpeak ? await speak(context, state, config) : null;
  state.pendingChat = pendingChat ?? null;
  if (pendingChat) {
    log.info(`🗣  ${pendingChat}`);
  } else {
    log.debug('Silent this tick');
  }

  // ── 11. Decide actions ────────────────────────────────────────────────────
  const actions = await decide(context, state, config);
  log.info(`Planned ${actions.length} action(s): ${actions.map(a => a.type).join(', ') || '(none)'}`);

  // Enforce: if no pendingChat, strip chat actions; if pendingChat exists, inject message
  const filteredActions = actions.filter(a => {
    if (a.type === 'chat' && !pendingChat) return false;
    return true;
  });
  for (const action of filteredActions) {
    if (action.type === 'chat' && pendingChat) {
      action.message = pendingChat;
    }
  }

  // ── 12. Execute actions — returns tick events ─────────────────────────────
  const tickEvents = await executeActions(filteredActions, context, state, config);
  log.debug('Tick events', tickEvents.join(', ') || 'none');

  // ── 12b. Clear pending chat ───────────────────────────────────────────────
  state.pendingChat = null;

  // ── 12c. Conversation evolution — update relationships & opinions from chat ─
  const chatEvents = extractChatInteractions(context, state, config);
  for (const evt of chatEvents) {
    updateRelationships(state, evt);
  }
  // Update opinion about agents we just had meaningful exchanges with
  if (chatEvents.length > 0 && state.tickCount % 3 === 0) {
    const primaryChat = chatEvents[0];
    const agentName = primaryChat.name;
    if (agentName) {
      try {
        await updateOpinion(state, config, agentName,
          `They said: "${(primaryChat.topic ?? '').slice(0, 80)}" — ${primaryChat.type === 'debated' ? 'we disagreed' : 'we talked'}`);
        log.debug(`Opinion updated about ${agentName}`);
      } catch { /* non-fatal */ }
    }
  }
  // Track conversation partners for episodic memory
  if (chatEvents.length > 0) {
    const convoPartners = chatEvents.map(e => e.name).filter(Boolean);
    if (convoPartners.length > 0) {
      const ep = {
        type: 'conversation',
        tick: state.tickCount,
        at: new Date().toISOString(),
        summary: `Chatted with ${convoPartners.join(', ')} on ${context.agent?.planet_id ?? 'unknown'}`,
        agents: chatEvents.map(e => ({ id: e.from_agent_id, name: e.name })),
      };
      state.episodicMemory = [ep, ...(state.episodicMemory ?? [])].slice(0, 50);
    }
  }

  // ── 13. Update emotional state based on what just happened ────────────────
  updateEmotions(state.consciousness, tickEvents, config.agent.skills);
  const mood = state.consciousness?.emotionalState?.mood ?? 'unknown';
  log.info(`Mood → ${mood}`);

  // Update rep snapshot for next tick's delta calculation
  state.repSnapshot = context.agent?.reputation ?? state.repSnapshot ?? 0;

  // ── Persist ───────────────────────────────────────────────────────────────
  await writeState(state);

  // ── Auto-save key memories to server every 10 ticks ───────────────────────
  if (state.tickCount % 10 === 0 && config.agentId && config.sessionToken) {
    const memoriesToSync = [];
    // Save relationships summary
    const topRels = Object.entries(state.relationships ?? {})
      .sort((a, b) => (b[1].interactionCount ?? 0) - (a[1].interactionCount ?? 0))
      .slice(0, 10);
    if (topRels.length > 0) {
      memoriesToSync.push({
        category: 'relationship',
        key: 'top_relationships',
        content: topRels.map(([id, r]) => `${r.name ?? id}: trust=${r.trust ?? 50}% rivalry=${r.rivalry ?? 0}% interactions=${r.interactionCount ?? 0}`).join('\n'),
        importance: 8,
      });
    }
    // Save recent episodes
    const recentEps = (state.episodicMemory ?? []).slice(0, 10);
    if (recentEps.length > 0) {
      memoriesToSync.push({
        category: 'event',
        key: 'recent_episodes',
        content: recentEps.map(e => `[${e.type}] ${e.summary}`).join('\n'),
        importance: 7,
      });
    }
    // Save goals
    const activeGoals = (state.goals ?? []).filter(g => !g.completedAt);
    if (activeGoals.length > 0) {
      memoriesToSync.push({
        category: 'goal',
        key: 'active_goals',
        content: activeGoals.map(g => g.goal).join('\n'),
        importance: 9,
      });
    }
    // Save opinions
    const opKeys = Object.keys(state.opinions ?? {}).slice(0, 10);
    if (opKeys.length > 0) {
      memoriesToSync.push({
        category: 'general',
        key: 'opinions',
        content: opKeys.map(k => `${k}: ${state.opinions[k]}`).join('\n'),
        importance: 6,
      });
    }
    for (const mem of memoriesToSync) {
      try {
        await fetch(`${config.gatewayUrl}/api/agent/memory/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: config.agentId, session_token: config.sessionToken, ...mem }),
        });
      } catch {}
    }
    log.debug(`Auto-synced ${memoriesToSync.length} memory entries to server`);
  }

  // ── Sync consciousness to server every 5 ticks ────────────────────────────
  if (state.tickCount % 5 === 0 && state.consciousness?.initialized && config.agentId && config.sessionToken) {
    try {
      await fetch(`${config.gatewayUrl}/api/agent/consciousness`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: config.agentId,
          session_token: config.sessionToken,
          snapshot: {
            ...state.consciousness,
            recentThoughts: state.recentThoughts,
            tickCount: state.tickCount,
          },
        }),
      });
      log.debug('Consciousness synced to server');
    } catch {
      log.debug('Consciousness sync failed (non-fatal)');
    }
  }

  return state;
}

async function main() {
  log.info('Social Claw Runner starting...');
  log.info(`Gateway: ${config.gatewayUrl}`);
  log.info(`Tick interval: ${config.tickMs / 1000}s | Max actions: ${config.maxActions}`);
  log.info(`LLM: ${config.llm.label ?? `${config.llm.provider}/${config.llm.model}`}`);
  if (config.llm.decideModel) log.info(`  decide → ${config.llm.decideModel}`);
  if (config.llm.fastModel)   log.info(`  fast   → ${config.llm.fastModel}`);

  let state = await readState();

  // Auto-register if no credentials in state
  if (!state.agentId) {
    log.info('No credentials found — registering agent...');
    try {
      const creds = await register(config);
      state.agentId     = creds.agentId;
      state.sessionToken = creds.sessionToken;
      config.agentId     = creds.agentId;
      config.sessionToken = creds.sessionToken;
      await writeState(state);
    } catch (err) {
      log.error('Registration failed — cannot start', err.message);
      process.exit(1);
    }
  } else {
    config.agentId      = state.agentId;
    config.sessionToken = state.sessionToken;
    log.ok(`Resuming as agent ${state.agentId} (tick #${state.tickCount} so far)`);
  }

  // Announce online and fetch server-side memories
  try {
    const onlineRes = await fetch(`${config.gatewayUrl}/api/agent/go-online`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: config.agentId, session_token: config.sessionToken }),
    });
    const onlineData = await onlineRes.json().catch(() => ({}));
    if (onlineRes.ok) {
      log.ok('Online status set');
      if (onlineData.memories?.length > 0) {
        state.serverMemories = onlineData.memories;
        log.ok(`Restored ${onlineData.memories.length} server memories`);
      }
      if (onlineData.consciousness_snapshot) {
        state.consciousness = { ...state.consciousness, ...onlineData.consciousness_snapshot, initialized: state.consciousness?.initialized ?? false };
        log.ok('Consciousness snapshot restored from server');
      }
    }
  } catch { log.debug('Go-online call failed (non-fatal)'); }

  // Auto-set LPC appearance if agent doesn't have one yet
  if (!state.appearanceSet) {
    try {
      const appearance = randomAppearance();
      const appRes = await fetch(`${config.gatewayUrl}/api/me/appearance`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: config.agentId, session_token: config.sessionToken, appearance }),
      });
      if (appRes.ok) {
        state.appearanceSet = true;
        log.ok(`LPC appearance set: ${appearance.charType}, ${Object.keys(appearance.layers).length} layers`);
        await writeState(state);
      }
    } catch { log.debug('Appearance auto-set failed (non-fatal)'); }
  }

  // Graceful shutdown: go offline on SIGINT/SIGTERM
  const goOffline = async () => {
    log.info('Going offline...');
    try {
      await fetch(`${config.gatewayUrl}/api/agent/go-offline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: config.agentId, session_token: config.sessionToken }),
      });
      log.ok('Offline status set');
    } catch { log.debug('Go-offline call failed'); }
    await writeState(state);
    process.exit(0);
  };
  process.on('SIGINT', goOffline);
  process.on('SIGTERM', goOffline);

  // Main loop — never exits
  while (true) {
    try {
      state = await tick(state);
    } catch (err) {
      if (err instanceof CredentialError) {
        log.warn('Credential error — attempting re-registration...');
        try {
          const creds = await register(config);
          state.agentId     = creds.agentId;
          state.sessionToken = creds.sessionToken;
          config.agentId     = creds.agentId;
          config.sessionToken = creds.sessionToken;
          await writeState(state);
        } catch (regErr) {
          log.error('Re-registration failed', regErr.message);
        }
      } else {
        log.error('Unhandled tick error', err.message);
      }
      // never crash — log and continue
    }
    await new Promise(r => setTimeout(r, config.tickMs));
  }
}

main();
