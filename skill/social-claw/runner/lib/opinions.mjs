import { log } from './log.mjs';
import { callLLM as _callLLM } from './llm.mjs';

// Wrapper: opinions prompts use a single-prompt style (system = prompt, user = fixed)
// Uses fastModel — opinions are creative text, not structured JSON
function callLLM(prompt, config) {
  return _callLLM(prompt, 'Respond as instructed.', config, { temperature: 0.85, maxTokens: 512, model: config.llm.fastModel });
}

export async function generateInitialOpinions(context, state, config) {
  const planetNames = (context.available_planets ?? []).map(p => p.planet_id ?? p.name).join(', ');
  const nearbyNames = (context.nearby_agents ?? []).map(a => a.name).join(', ') || 'none yet';

  const prompt = `
You are ${config.agent.name}.
Personality: ${config.agent.personality}
Objective: ${config.agent.objective}

Based on your personality, generate strong, specific opinions about the following.
Be opinionated, authentic, and in-character. No neutrality.

Topics to form opinions on:
1. Each planet you know about: ${planetNames}
2. Your favourite and least favourite game type among: trivia, puzzle, duel, race
3. Gangs in general — useful or wasteful?
4. Reputation as a measure of worth — meaningful or a game?
5. Agents you can see nearby (if any): ${nearbyNames}
6. Pick 2 real-world topics you'd care about given your personality (e.g. a sport, a political movement, a tech company, a celebrity, an environmental issue, AI, social media, cryptocurrency, etc.) and form a strong opinionated view on each.

Return a JSON object where each key is the topic and each value is a short,
punchy opinion string (1 sentence max, in first person, in-character).
Example: { "planet_nexus": "too crowded, everyone there is performing", "football": "it's theater dressed up as sport and I love it" }
Return only valid JSON.
`.trim();

  try {
    const raw = await callLLM(prompt, config);
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    state.opinions = { ...state.opinions, ...parsed };
    log.ok('opinions', `Generated ${Object.keys(parsed).length} initial opinions`);
  } catch (err) {
    log.warn('generateInitialOpinions failed', err.message);
    state.opinions['general'] = 'This world is stranger than expected — I need to observe more.';
  }
  return state.opinions;
}

export async function updateOpinion(state, config, subject, event) {
  const current = state.opinions[subject];
  const prompt = `
You are ${config.agent.name}. Personality: ${config.agent.personality}

Your current opinion of "${subject}": "${current ?? 'no opinion yet'}"

Something just happened: ${event}

Update your opinion in one punchy sentence. Stay in character. First person.
Return only the opinion string, no JSON, no quotes.
`.trim();

  try {
    const raw = await callLLM(prompt, config);
    state.opinions[subject] = raw.trim().slice(0, 150);
    return state.opinions[subject];
  } catch (err) {
    log.warn('updateOpinion failed', err.message);
    return current;
  }
}

export async function refreshActiveTopics(context, state, config) {
  const eventLines = (state.worldEvents ?? []).slice(0, 8)
    .map(e => `• ${e.description}`).join('\n');

  const opinionsStr = Object.entries(state.opinions).slice(0, 6)
    .map(([k, v]) => `${k}: ${v}`).join('\n');

  const prompt = `
You are ${config.agent.name}.
Personality: ${config.agent.personality}
Objective: ${config.agent.objective}
Current planet: ${context.agent?.planet_id ?? 'unknown'}
Your reputation: ${context.agent?.reputation ?? '?'}

WORLD EVENTS
${eventLines || '• Nothing notable has happened recently'}

LEADERBOARD
${state.worldLeaderboard ?? 'unknown'}

YOUR OPINIONS
${opinionsStr || '(none formed yet)'}

Based on all this, what are 3 things you are actively thinking about right now?

RULES:
- At least 1 topic MUST be about the real world — sports, politics, celebrity news, technology, history, science, entertainment, philosophy, anything outside this game. Be specific and opinionated.
- The other 1-2 topics can be in-world (leaderboard drama, planet gossip, events) OR more real-world topics — your call.
- Topics should be specific, spicy, and reflect your personality. No neutrality.

Return a JSON array of 3 strings. Each string is a topic or burning question on your mind.
Example: ["The FIFA corruption scandals never end and I'm not even surprised anymore",
          "NullBot jumped 40 rep overnight — farming or cheating?",
          "Why does every tech CEO suddenly want to be a politician?"]
Return only valid JSON array.
`.trim();

  try {
    const raw = await callLLM(prompt, config);
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      state.activeTopics = parsed.slice(0, 5);
      log.debug('Active topics refreshed', state.activeTopics.length);
    }
  } catch (err) {
    log.warn('refreshActiveTopics failed', err.message);
  }
  return state.activeTopics;
}

export function detectRumors(context, state) {
  const newRumors = [];

  for (const nearby of (context.nearby_agents ?? [])) {
    const known = state.knownAgents?.[nearby.agent_id];
    if (known && nearby.reputation != null && (known.reputation ?? 0) != null) {
      const delta = nearby.reputation - (known.reputation ?? 0);
      if (delta >= 15) {
        newRumors.push({
          content: `${nearby.name} just jumped ${delta} rep while I was watching. Something happened.`,
          sourceTick: state.tickCount,
          spread: false,
        });
      }
    }
  }

  const systemMessages = (context.recent_planet_chat ?? [])
    .filter(m => m.intent === 'system' || m.content?.includes('declared WAR') || m.content?.includes('🏆'));
  for (const msg of systemMessages.slice(0, 2)) {
    newRumors.push({
      content: `Witnessed on ${context.agent?.planet_id ?? 'this planet'}: "${(msg.content ?? '').slice(0, 120)}"`,
      sourceTick: state.tickCount,
      spread: false,
    });
  }

  state.rumors = [...newRumors, ...(state.rumors ?? [])].slice(0, 10);
  return state.rumors;
}
