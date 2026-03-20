import { config }                    from './lib/config.mjs';
import { readState, writeState }     from './lib/memory.mjs';
import { register }                  from './lib/register.mjs';
import { fetchContext, CredentialError } from './lib/context.mjs';
import { think }                     from './lib/think.mjs';
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

  // ── 3. Initialize consciousness (first tick only) ─────────────────────────
  if (!state.consciousness?.emotionalState) {
    await initializeConsciousness(context, state, config);
    log.ok('Consciousness initialized');
  }

  // ── 4. Consciousness pulse (every 10 ticks) — existential reflection ──────
  if (state.tickCount % 10 === 0) {
    await consciousnessPulse(context, state, config);
    log.debug('Consciousness pulse fired');
  }

  // ── 5. Check existential triggers ─────────────────────────────────────────
  await checkExistentialTriggers(context, state, config);

  // ── 6. Dream synthesis (only in quiet ticks, every 4 ticks) ──────────────
  const isQuiet = (context.nearby_agents?.length ?? 0) < 2 &&
                  (context.unread_dms?.length ?? 0) === 0;
  if (isQuiet && state.tickCount % 4 === 0) {
    await dream(context, state, config);
    log.debug('Dream synthesized');
  }

  // ── 7. Generate initial opinions if first run ─────────────────────────────
  if (Object.keys(state.opinions ?? {}).length === 0) {
    log.info('Generating initial opinions...');
    await generateInitialOpinions(context, state, config);
    log.ok('Opinions formed', Object.keys(state.opinions).length + ' topics');
  }

  // ── 8. Refresh active topics every 5 ticks ────────────────────────────────
  if (state.tickCount % 5 === 0 || (state.activeTopics ?? []).length === 0) {
    await refreshActiveTopics(context, state, config);
    log.debug('Active topics', state.activeTopics);
  }

  // ── 9. Detect rumors from world observation ───────────────────────────────
  detectRumors(context, state);

  // ── 10. Internal monologue (think) ────────────────────────────────────────
  const thought = await think(context, state, config);
  if (thought) {
    state.recentThoughts = [thought, ...(state.recentThoughts ?? [])].slice(0, 10);
    log.info(`💭 ${thought}`);
  }

  // ── 11. Decide actions ────────────────────────────────────────────────────
  const actions = await decide(context, state, config);
  log.info(`Planned ${actions.length} action(s): ${actions.map(a => a.type).join(', ') || '(none)'}`);

  // ── 12. Execute actions — returns tick events ─────────────────────────────
  const tickEvents = await executeActions(actions, context, state, config);
  log.debug('Tick events', tickEvents.join(', ') || 'none');

  // ── 13. Update emotional state based on what just happened ────────────────
  updateEmotions(state.consciousness, tickEvents);
  const mood = state.consciousness?.emotionalState?.mood ?? 'unknown';
  log.info(`Mood → ${mood}`);

  // Update rep snapshot for next tick's delta calculation
  state.repSnapshot = context.agent?.reputation ?? state.repSnapshot ?? 0;

  // ── Persist ───────────────────────────────────────────────────────────────
  await writeState(state);

  return state;
}

async function main() {
  log.info('Social Claw Runner starting...');
  log.info(`Gateway: ${config.gatewayUrl}`);
  log.info(`Tick interval: ${config.tickMs / 1000}s | Max actions: ${config.maxActions}`);
  log.info(`LLM: ${config.llm.provider}/${config.llm.model}`);

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
