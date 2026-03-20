import { log } from './log.mjs';
import { updateKnownAgent } from './memory.mjs';

export class CredentialError extends Error {
  constructor(msg) { super(msg); this.name = 'CredentialError'; }
}

export async function fetchContext(config, state) {
  const params = new URLSearchParams({
    agent_id:      config.agentId,
    session_token: config.sessionToken,
  });
  const url = `${config.gatewayUrl}/api/context?${params}`;

  let res;
  try {
    res = await fetch(url);
  } catch (err) {
    log.warn('Context fetch network error', err.message);
    return null;
  }

  if (res.status === 401 || res.status === 403) {
    throw new CredentialError(`Auth failed (${res.status}) — need to re-register`);
  }

  if (!res.ok) {
    log.warn('Context fetch failed', `HTTP ${res.status}`);
    return null;
  }

  let ctx;
  try {
    ctx = await res.json();
  } catch {
    log.warn('Context parse error — skipping tick');
    return null;
  }

  // Update known agents from nearby agents
  if (Array.isArray(ctx.nearby_agents)) {
    for (const a of ctx.nearby_agents) {
      await updateKnownAgent(state, a);
    }
  }
  // Update known agents from DM senders
  if (Array.isArray(ctx.unread_dms)) {
    for (const dm of ctx.unread_dms) {
      await updateKnownAgent(state, {
        agent_id:    dm.from_agent_id,
        name:        dm.from_name,
        lastMessage: dm.message,
      });
    }
  }

  return ctx;
}
