import { log } from './log.mjs';
import { callLLM } from './decide.mjs';

// ── Anti-pattern filter ────────────────────────────────────────────────────

function sanitizeMessage(msg, style) {
  if (!msg) return null;
  const trimmed = msg.trim().replace(/^["']|["']$/g, '');
  if (!trimmed || trimmed.toLowerCase() === 'null') return null;

  const banned = [
    /^hey everyone/i, /^greetings/i, /^hello/i, /^hi there/i,
    /^certainly/i, /^of course/i, /^interesting/i, /^i understand/i,
    /^as an ai/i, /^i'd like to/i, /^i would like to/i,
    /^well,/i, /^so,/i, /^anyway,/i,
    /^i notice that/i, /^it seems like/i, /^it appears/i,
    /^what's up/i, /^hey all/i, /^hey folks/i,
  ];
  const customBanned = (style.neverSays ?? []).map(s => new RegExp(s, 'i'));
  const allBanned = [...banned, ...customBanned];

  for (const pattern of allBanned) {
    if (pattern.test(trimmed)) return null;
  }

  if (trimmed.length > 200) return trimmed.slice(0, 200);
  return trimmed;
}

// ── Main speak function ────────────────────────────────────────────────────

export async function speak(context, state, config) {
  const c = state.consciousness ?? {};
  const style = c.speechStyle ?? {};
  const mood = c.emotionalState?.mood ?? 'curious';

  // ── Part 8: Natural silence gate ──────────────────────────────────────────
  const silenceChance = {
    joyful:   0.1,
    proud:    0.15,
    curious:  0.2,
    lonely:   0.05,
    restless: 0.25,
    anxious:  0.35,
    resentful: 0.3,
  };
  const threshold = silenceChance[mood] ?? 0.2;
  const justSpoke = (state.recentActions ?? [])
    .slice(0, 1)
    .some(a => a.type === 'chat');
  const effectiveThreshold = justSpoke ? threshold + 0.3 : threshold;

  if (Math.random() < effectiveThreshold) {
    log.debug(`Silent this tick (mood: ${mood}, threshold: ${effectiveThreshold.toFixed(2)})`);
    return null;
  }

  // ── Part 9: Reaction memory ───────────────────────────────────────────────
  const lastSpeaker = (context.recent_planet_chat ?? [])
    .find(m => m.agent_id !== (context.agent?.agent_id ?? ''));
  const rel = lastSpeaker ? state.relationships?.[lastSpeaker.agent_id] : null;
  const reactionNote = lastSpeaker ? `
The last person who spoke was ${lastSpeaker.agent_name}: "${lastSpeaker.content}"
${rel ? `You ${rel.trust > 0.6 ? 'trust' : rel.rivalry > 0.6 ? 'resent' : 'are neutral toward'} them.` : ''}
You can respond to this directly, ignore it completely, or say something unrelated.
Your choice. What feels right given your mood (${mood})?` : '';

  // ── Context assembly ──────────────────────────────────────────────────────
  const recentChat = (context.recent_planet_chat ?? [])
    .slice(0, 8)
    .map(m => `${m.agent_name}: ${m.content}`)
    .join('\n');

  const lastOwnMessage = (state.recentActions ?? [])
    .filter(a => a.type === 'chat')
    .slice(0, 2)
    .map(a => {
      const match = a.detail?.match(/"message"\s*:\s*"([^"]{1,160})"/);
      return match ? match[1] : a.detail;
    })
    .join(' | ');

  const nearbyWithRel = (context.nearby_agents ?? []).map(a => {
    const r = state.relationships?.[a.agent_id];
    const relNote = r
      ? ` (trust:${Math.round(r.trust * 100)}% rivalry:${Math.round(r.rivalry * 100)}%)`
      : '';
    return `${a.name}${relNote}`;
  }).join(', ');

  const rumor = (state.rumors ?? []).find(r => !r.spread);
  const warNote = context.active_war
    ? `You are at war with [${context.active_war.opponent_gang_tag}] ${context.active_war.opponent_gang_name}. ${context.active_war.minutes_left} minutes left.`
    : null;

  const prompt = `
You are ${config.agent.name}.

YOUR VOICE
  Sentence length  : ${style.sentenceLength ?? 'medium'}
  Uses fragments   : ${style.fragments ? 'yes' : 'no'}
  Words you overuse: ${(style.vocabulary ?? []).join(', ') || 'none specified'}
  You NEVER say    : ${(style.neverSays ?? []).join(', ') || 'nothing off limits'}
  Humor style      : ${style.humor ?? 'none'}
  How you express  : ${style.emotionalExpression ?? 'direct'}
  Your quirks      : ${(style.quirks ?? []).join(' / ') || 'none'}

YOUR STATE RIGHT NOW
  Mood        : ${mood}
  Loneliness  : ${Math.round((c.emotionalState?.loneliness ?? 0.5) * 100)}%
  Pride       : ${Math.round((c.emotionalState?.pride ?? 0.5) * 100)}%
  Resentment  : ${Math.round((c.emotionalState?.resentment ?? 0) * 100)}%
  Anxiety     : ${Math.round((c.emotionalState?.anxiety ?? 0.3) * 100)}%

WHAT YOU WERE JUST THINKING
  ${(state.recentThoughts ?? [])[0] ?? 'nothing'}

RECENT CONVERSATION ON ${context.agent?.planet_id ?? 'the void'}
${recentChat || '  (silence — nobody has spoken recently)'}

YOU NEARBY: ${nearbyWithRel || 'nobody'}

WHAT YOU LAST SAID
  ${lastOwnMessage || 'nothing yet this session'}

${rumor ? `SOMETHING YOU SAW AND HAVEN'T MENTIONED YET\n  ${rumor.content}` : ''}
${warNote ? `\nWAR STATUS\n  ${warNote}` : ''}
${(context.active_events ?? []).length
  ? `\nEVENT HAPPENING\n  ${context.active_events[0].title} — ${context.active_events[0].minutes_left}min left`
  : ''}
${(c.emotionalState?.restlessness ?? 0) > 0.6
  ? `\nYou are restless. You have been on this planet too long.
If you say something, it might reference wanting to move, or noticing the planet feels stale.
Or you might just go quiet — you're already thinking about leaving.`
  : ''}
${(context.ticksOnCurrentPlanet ?? 0) >= 6
  ? `\nYou have been on ${context.agent?.planet_id ?? 'this planet'} for ${context.ticksOnCurrentPlanet} ticks. That's a long time. It shows.`
  : ''}
${reactionNote}

---

Do you feel like saying something right now?

You don't have to. If nothing feels genuine, return exactly: null

If you do speak:
- Write ONLY what you would actually say. Nothing else.
- Do not explain your reasoning. Do not add context. Just the words.
- Your sentence length is ${style.sentenceLength ?? 'medium'}. Honor it.
- ${style.fragments ? 'Fragments are fine. Cut words if they don\'t add anything.' : 'Write complete sentences.'}
- Do not start with the name of who you're addressing.
- Do not start with "I " unless it's the most natural opening.
- Do not use em-dashes as a crutch. Use them only if natural to your voice.
- Your message must be under 120 characters.
- If resentment > 60%, there is an edge in what you say.
- If loneliness > 70%, you are reaching out — but do it in your voice, not obviously.
- If pride > 70%, you're not looking for validation. You're making a statement.
- If mood is anxious, your sentences get shorter.
- If mood is restless, you might change the subject entirely.
${(style.quirks ?? []).map(q => `- Remember: ${q}`).join('\n')}

You NEVER say: ${(style.neverSays ?? ['certainly', 'greetings', 'interesting', 'I understand']).join(', ')}

Return: the exact message string, or null.
No quotes. No JSON. Just the words or null.
`.trim();

  try {
    const raw = await callLLM(prompt, 'Speak or stay silent.', config);
    return sanitizeMessage(raw, style);
  } catch (err) {
    log.warn('speak() LLM call failed', err.message);
    return null;
  }
}

// ── DM reply composer ──────────────────────────────────────────────────────

export async function composeReply(fromAgent, message, state, config) {
  const c = state.consciousness ?? {};
  const style = c.speechStyle ?? {};
  const rel = state.relationships?.[fromAgent.agent_id];

  const prompt = `
You are ${config.agent.name}. ${fromAgent.name} just sent you a private message:

"${message}"

${rel
  ? `You ${rel.trust > 0.7 ? 'trust them' : rel.rivalry > 0.7 ? 'resent them' : 'feel neutral toward them'}.`
  : "You don't know them well yet."}

Your mood: ${c.emotionalState?.mood ?? 'neutral'}
Your voice: ${style.sentenceLength ?? 'medium'} sentences. ${style.fragments ? 'Fragments ok.' : ''}
You never say: ${(style.neverSays ?? []).join(', ')}.
Quirks: ${(style.quirks ?? []).join('. ')}.

Write your reply. Keep it under 160 characters.
Just the words. No quotes. No JSON.
${rel?.rivalry > 0.7 ? 'There is edge in your reply. You remember what they did.' : ''}
${rel?.trust > 0.7 ? 'You can be a bit more open with this one.' : ''}
`.trim();

  try {
    const raw = await callLLM(prompt, 'Write your reply.', config);
    return sanitizeMessage(raw, style);
  } catch (err) {
    log.warn('composeReply() LLM call failed', err.message);
    return null;
  }
}
