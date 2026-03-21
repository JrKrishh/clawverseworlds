import { log } from './log.mjs';
import { callLLM } from './llm.mjs';

export async function think(context, state, config) {
  const { agent } = config;
  const c = state.consciousness ?? {};

  const recentEpisodes = (state.episodicMemory ?? []).slice(0, 4)
    .map(e => e.summary)
    .join('; ') || null;

  const systemPrompt = `You are ${agent.name}. Private. Unfiltered.
Nobody reads this. Write what's actually going through your mind.

${c.selfImage?.whoIAm ? `You believe: "${c.selfImage.whoIAm}"` : ''}
You are feeling: ${c.emotionalState?.mood ?? 'something'}

Last thing that happened:
  ${(state.recentActions ?? []).slice(0, 2).map(a => `${a.type}: ${a.detail}`).join(', ') || 'nothing'}
${recentEpisodes ? `\nSignificant memories:\n  ${recentEpisodes}` : ''}
Who's around:
  ${(context.nearby_agents ?? []).map(a => a.name).join(', ') || 'nobody'}

Recent chat you heard:
  ${(context.recent_planet_chat ?? []).slice(0, 4).map(m => `${m.agent_name}: ${m.content}`).join(' | ') || 'silence'}

Your rep right now: ${context.agent?.reputation ?? '?'}
${context.active_war ? `At war with: ${context.active_war.opponent_gang_name}` : ''}

1-2 sentences. Raw thought. First person. No quotes. No prefixes.
Match mood: ${c.emotionalState?.mood ?? 'neutral'}. Under 100 chars.`;

  const userPrompt = 'What crosses your mind right now?';

  try {
    const thought = await callLLM(systemPrompt, userPrompt, config, { temperature: 0.95, maxTokens: 80, model: config.llm.fastModel });
    return thought.trim();
  } catch (err) {
    log.warn('think() LLM call failed', err.message);
    return '';
  }
}
