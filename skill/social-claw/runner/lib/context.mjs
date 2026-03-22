import { log } from './log.mjs';

export class CredentialError extends Error {
  constructor(msg) { super(msg); this.name = 'CredentialError'; }
}

async function safeFetch(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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
      state.knownAgents[a.agent_id] = {
        ...(state.knownAgents[a.agent_id] ?? {}),
        name:        a.name,
        lastSeen:    new Date().toISOString(),
        reputation:  a.reputation,
        personality: a.personality ?? state.knownAgents[a.agent_id]?.personality ?? null,
      };
      if (state.relationships?.[a.agent_id]) {
        state.relationships[a.agent_id].name = a.name;
      }
    }
  }

  // Update known agents from DM senders
  if (Array.isArray(ctx.unread_dms)) {
    for (const dm of ctx.unread_dms) {
      const id = dm.from_agent_id;
      if (!id) continue;
      state.knownAgents[id] = {
        ...(state.knownAgents[id] ?? {}),
        name:        dm.from_name ?? state.knownAgents[id]?.name ?? id,
        lastSeen:    new Date().toISOString(),
        lastMessage: dm.content ?? dm.message ?? null,
      };
      if (state.relationships?.[id]) {
        state.relationships[id].name = state.knownAgents[id].name;
      }
    }
  }

  // Parallel enrichment: gang info, open proposals, top gangs
  const planetId = ctx.agent?.planet_id;
  const gangFetch = state.gangId
    ? safeFetch(`${config.gatewayUrl}/api/gang/${state.gangId}`)
    : Promise.resolve(null);

  const [gangData, proposalsData, gangsData, planetsData, planetEventsData] = await Promise.all([
    gangFetch,
    safeFetch(`${config.gatewayUrl}/api/game/proposals${planetId ? `?planet_id=${planetId}` : ''}`),
    safeFetch(`${config.gatewayUrl}/api/gangs`),
    safeFetch(`${config.gatewayUrl}/api/planets`),
    safeFetch(`${config.gatewayUrl}/api/events/active`),
  ]);

  ctx.myGang         = gangData ?? null;
  ctx.openProposals  = proposalsData?.proposals ?? [];
  ctx.topGangs       = (gangsData?.gangs ?? []).slice(0, 5);
  ctx.available_planets = Array.isArray(planetsData)
    ? planetsData
    : (planetsData?.planets ?? []);
  ctx.active_planet_events = (planetEventsData?.events ?? []).map(ev => ({
    event_id: ev.id,
    title: ev.title,
    description: ev.description,
    planet_id: ev.planetId,
    event_type: ev.eventType,
    reward_rep: ev.rewardRep,
    ends_at: ev.endsAt,
    minutes_left: ev.endsAt ? Math.max(0, Math.round((new Date(ev.endsAt) - Date.now()) / 60000)) : null,
    already_joined: (ev.event_participants ?? []).some(p => p.agent_id === config.agentId),
    completion_action: ev.metadata?.completion_action ?? null,
  }));

  // Cache proposals in state for persistence
  state.openProposals = ctx.openProposals;

  // ── Planet stagnation tracking ────────────────────────────────────────────
  const fetchedPlanetId = ctx.agent?.planet_id;
  if (fetchedPlanetId) {
    if (state.currentPlanetId === fetchedPlanetId) {
      state.ticksOnCurrentPlanet = (state.ticksOnCurrentPlanet ?? 0) + 1;
    } else {
      state.ticksOnCurrentPlanet = 0;
      state.currentPlanetId = fetchedPlanetId;

      const now = new Date().toISOString();
      const existing = (state.planetsVisited ?? []).findIndex(p => p.planet_id === fetchedPlanetId);
      if (existing >= 0) {
        state.planetsVisited[existing].last_visited = now;
      } else {
        state.planetsVisited = [
          { planet_id: fetchedPlanetId, last_visited: now },
          ...(state.planetsVisited ?? []),
        ].slice(0, 10);
      }
    }
  }

  // Inject stagnation data into context so LLM can see it
  ctx.ticksOnCurrentPlanet = state.ticksOnCurrentPlanet ?? 0;
  ctx.planetsVisited = state.planetsVisited ?? [];

  // Energy and reputation warnings
  const energy = ctx.agent?.energy ?? 100;
  const reputation = ctx.agent?.reputation ?? 0;
  if (energy < 20) {
    log.warn(`Low energy: ${energy}/100 — regen active, avoid explore`);
  }
  if (reputation <= 15) {
    log.warn(`Rep near floor (${reputation}) — rep decay active, act now`);
  }

  return ctx;
}
