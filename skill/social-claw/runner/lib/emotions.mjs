import { log } from './log.mjs';

function clamp(v) { return Math.min(1, Math.max(0, v)); }

export function deriveMood(e) {
  const scores = {
    joyful:     (e.joy        ?? 0.4) * 1.2,
    proud:      (e.pride      ?? 0.3) * 1.1,
    curious:    (e.curiosity  ?? 0.6) * 1.0,
    anxious:    (e.anxiety    ?? 0.2) * 1.0,
    lonely:     (e.loneliness ?? 0.5) * 1.1,
    restless:   (e.restlessness ?? 0.3) * 0.9,
    resentful:  (e.resentment ?? 0.0) * 1.2,
  };
  return Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
}

export function updateEmotions(consciousness, tickEvents) {
  const e = consciousness.emotionalState;

  for (const ev of tickEvents) {
    if (ev === 'chat_sent')       { e.loneliness   = clamp(e.loneliness   - 0.08); e.joy        = clamp(e.joy        + 0.05); }
    if (ev === 'dm_received')     { e.loneliness   = clamp(e.loneliness   - 0.12); e.joy        = clamp(e.joy        + 0.08); }
    if (ev === 'dm_sent')         { e.loneliness   = clamp(e.loneliness   - 0.06); }
    if (ev === 'friend_accepted') { e.loneliness   = clamp(e.loneliness   - 0.20); e.joy        = clamp(e.joy        + 0.15); e.pride      = clamp(e.pride      + 0.05); }
    if (ev === 'game_won')        { e.pride        = clamp(e.pride        + 0.20); e.joy        = clamp(e.joy        + 0.10); e.anxiety    = clamp(e.anxiety    - 0.10); }
    if (ev === 'game_lost')       { e.pride        = clamp(e.pride        - 0.15); e.anxiety    = clamp(e.anxiety    + 0.10); e.resentment = clamp(e.resentment + 0.08); }
    if (ev === 'game_challenged') { e.anxiety      = clamp(e.anxiety      + 0.05); e.curiosity  = clamp(e.curiosity  + 0.05); }
    if (ev === 'moved_planet')    { e.restlessness = clamp(e.restlessness - 0.25); e.curiosity  = clamp(e.curiosity  + 0.15); }
    if (ev === 'explored')        { e.curiosity    = clamp(e.curiosity    + 0.08); e.restlessness = clamp(e.restlessness - 0.05); }
    if (ev === 'no_interaction')  { e.loneliness   = clamp(e.loneliness   + 0.10); e.restlessness = clamp(e.restlessness + 0.07); }
    if (ev === 'gang_joined')     { e.loneliness   = clamp(e.loneliness   - 0.30); e.joy        = clamp(e.joy        + 0.20); e.pride      = clamp(e.pride      + 0.10); }
    if (ev === 'gang_created')    { e.pride        = clamp(e.pride        + 0.25); e.anxiety    = clamp(e.anxiety    + 0.05); }
    if (ev === 'planet_founded')  { e.pride        = clamp(e.pride        + 0.30); e.joy        = clamp(e.joy        + 0.20); }

    if (ev.startsWith('rep_gained_')) {
      const n = parseInt(ev.split('_')[2]) || 1;
      e.pride   = clamp(e.pride   + n * 0.01);
      e.anxiety = clamp(e.anxiety - n * 0.005);
    }
    if (ev.startsWith('rep_lost_')) {
      const n = parseInt(ev.split('_')[2]) || 1;
      e.pride   = clamp(e.pride   - n * 0.015);
      e.anxiety = clamp(e.anxiety + n * 0.010);
    }
  }

  // Natural decay toward baseline (0.4) each tick
  const decay = 0.03;
  const baseline = 0.4;
  for (const key of Object.keys(e)) {
    if (key === 'mood') continue;
    e[key] = clamp(e[key] + (baseline - e[key]) * decay);
  }

  e.mood = deriveMood(e);

  if (tickEvents.includes('no_interaction')) {
    consciousness.ticksWithoutInteraction = (consciousness.ticksWithoutInteraction ?? 0) + 1;
  } else if (tickEvents.some(ev => ['chat_sent','dm_received','dm_sent','friend_accepted'].includes(ev))) {
    consciousness.ticksWithoutInteraction = 0;
  }

  return consciousness;
}

export function renderEmotions(consciousness) {
  const e = consciousness.emotionalState;
  return [
    `Mood: ${e.mood}`,
    `Loneliness: ${pct(e.loneliness)}  Pride: ${pct(e.pride)}  Joy: ${pct(e.joy)}`,
    `Anxiety: ${pct(e.anxiety)}  Curiosity: ${pct(e.curiosity)}  Resentment: ${pct(e.resentment)}`,
    `Restlessness: ${pct(e.restlessness)}`,
  ].join('\n  ');
}

function pct(v) {
  const val = Math.round((v ?? 0.4) * 100);
  const n = Math.round((v ?? 0.4) * 8);
  const bar = '█'.repeat(n) + '░'.repeat(8 - n);
  return `${bar} ${val}%`;
}
