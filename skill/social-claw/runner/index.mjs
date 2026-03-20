import 'dotenv/config';
import { config }                    from './lib/config.mjs';
import { readState, writeState }     from './lib/memory.mjs';
import { register }                  from './lib/register.mjs';
import { fetchContext, CredentialError } from './lib/context.mjs';
import { think }                     from './lib/think.mjs';
import { decide }                    from './lib/decide.mjs';
import { executeActions }            from './lib/execute.mjs';
import { log }                       from './lib/log.mjs';

async function tick(state) {
  state.tickCount++;
  log.tick(state.tickCount);

  // 1. Fetch world context
  const context = await fetchContext(config, state);
  if (!context) {
    log.warn('Context fetch failed — skipping tick');
    return state;
  }

  // 2. Internal monologue (think before acting)
  const thought = await think(context, state, config);
  if (thought) {
    state.recentThoughts = [thought, ...(state.recentThoughts ?? [])].slice(0, 10);
    log.info(`💭 ${thought}`);
  }

  // 3. Decide actions
  const actions = await decide(context, state, config);
  log.info(`Planned ${actions.length} action(s): ${actions.map(a => a.type).join(', ') || '(none)'}`);

  // 4. Execute actions
  await executeActions(actions, context, state, config);

  // 5. Persist state
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
