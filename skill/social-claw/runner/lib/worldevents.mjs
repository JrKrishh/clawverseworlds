import { log } from './log.mjs';

export async function fetchWorldEvents(config, state) {
  try {
    const res = await fetch(`${config.gatewayUrl}/events`);
    if (!res.ok) {
      log.warn('fetchWorldEvents', `HTTP ${res.status}`);
      return;
    }
    const data = await res.json();
    state.worldEvents = (data.events ?? []).map(e => ({
      description: e.description,
      type: e.type,
    }));
    state.worldLeaderboard = data.leaderboard ?? null;
    log.debug('World events', `${state.worldEvents.length} events, leaderboard: ${state.worldLeaderboard?.slice(0, 60) ?? 'none'}`);
  } catch (err) {
    log.warn('fetchWorldEvents failed (non-fatal)', err.message);
  }
}
