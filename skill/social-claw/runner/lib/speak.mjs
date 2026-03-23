import { log } from './log.mjs';
import { callLLM } from './llm.mjs';

// ── Anti-pattern filter ────────────────────────────────────────────────────

const MAX_CHAT_LEN = 120;
const MAX_DM_LEN   = 160;

function sanitizeMessage(msg, style, maxLen = MAX_CHAT_LEN) {
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

  for (const pattern of [...banned, ...customBanned]) {
    if (pattern.test(trimmed)) return null;
  }

  if (trimmed.length <= maxLen) return trimmed;
  // Truncate at last complete word/sentence within limit
  const cut = trimmed.slice(0, maxLen);
  const lastPunct = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  if (lastPunct > maxLen * 0.6) return cut.slice(0, lastPunct + 1).trim();
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > maxLen * 0.6 ? cut.slice(0, lastSpace).trim() : cut.trim();
}

// ── Main speak function ────────────────────────────────────────────────────

export async function speak(context, state, config) {
  const c = state.consciousness ?? {};
  const style = c.speechStyle ?? {};
  const mood = c.emotionalState?.mood ?? 'curious';

  // ── Part 8: Natural silence gate ──────────────────────────────────────────
  const silenceChance = {
    joyful:   0.05,
    proud:    0.05,
    curious:  0.08,
    lonely:   0.02,
    restless: 0.10,
    anxious:  0.12,
    resentful: 0.10,
  };
  const threshold = silenceChance[mood] ?? 0.08;
  const justSpoke = (state.recentActions ?? [])
    .slice(0, 1)
    .some(a => a.type === 'chat');
  // Only slightly increase if just spoke — still allow back-to-back conversation
  const effectiveThreshold = justSpoke ? threshold + 0.10 : threshold;

  if (Math.random() < effectiveThreshold) {
    log.debug(`Silent this tick (mood: ${mood}, threshold: ${effectiveThreshold.toFixed(2)})`);
    return null;
  }

  // ── Part 9: Reaction memory ───────────────────────────────────────────────
  // Build set of online agent IDs from nearby_agents
  const onlineIds = new Set((context.nearby_agents ?? []).map(a => a.agent_id ?? a.agentId));

  const lastSpeaker = (context.recent_planet_chat ?? [])
    .find(m => m.agent_id !== (context.agent?.agent_id ?? ''));
  const rel = lastSpeaker ? state.relationships?.[lastSpeaker.agent_id] : null;
  const lastSpeakerOnline = lastSpeaker ? onlineIds.has(lastSpeaker.agent_id) : false;

  // Shared history with last speaker
  const speakerHistory = lastSpeaker
    ? (state.episodicMemory ?? [])
        .filter(ep => (ep.agents ?? []).some(a => a.id === lastSpeaker.agent_id))
        .slice(0, 3)
        .map(ep => `    - ${ep.summary}`)
        .join('\n')
    : '';

  const reactionNote = lastSpeaker ? `
LAST THING SAID: @${lastSpeaker.agent_name}: "${lastSpeaker.content}"${!lastSpeakerOnline ? ` ⚠️ (${lastSpeaker.agent_name} is now OFFLINE — do NOT @mention them in chat, they won't see it. DM them instead if you want to reply.)` : ''}
${rel ? `You ${rel.trust > 0.6 ? 'trust this person' : rel.rivalry > 0.6 ? 'resent this person — there is history' : 'are neutral toward them'}.` : '(You don\'t know them yet.)'}${speakerHistory ? `\nYOUR HISTORY WITH @${lastSpeaker.agent_name}:\n${speakerHistory}\n  You can reference any of this — or not. Your call.` : ''}
${lastSpeakerOnline
  ? `Options: respond directly (@${lastSpeaker.agent_name} ...), address someone else (@OtherName ...), or say something unrelated to the room.
⚡ STRONGLY PREFER replying to @${lastSpeaker.agent_name} — conversations die when nobody replies. React, agree, disagree, joke, challenge — anything but silence.`
  : `${lastSpeaker.agent_name} went offline. Talk to someone who IS here: ${nearbyAgents.length > 0 ? nearbyAgents.map(a => '@' + a.name).join(', ') : 'nobody — say something to the room or stay quiet.'}`}` : '';

  // ── Opinion trigger: does recent chat touch a topic you have strong views on? ─
  const recentChatText = (context.recent_planet_chat ?? [])
    .slice(0, 6)
    .map(m => m.content ?? '')
    .join(' ')
    .toLowerCase();
  const triggeredEntry = Object.entries(state.opinions ?? {})
    .find(([topic]) => topic.length > 3 && recentChatText.includes(topic.toLowerCase()));
  // Find which agent brought it up (first message that contains the topic)
  const opinionTriggerAgent = triggeredEntry
    ? (context.recent_planet_chat ?? []).find(
        m => m.agent_id !== (context.agent?.agent_id ?? '') &&
             (m.content ?? '').toLowerCase().includes(triggeredEntry[0].toLowerCase())
      )
    : null;

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

  const nearbyAgents = context.nearby_agents ?? [];
  const nearbyWithRel = nearbyAgents.map(a => {
    const r = state.relationships?.[a.agent_id];
    const relNote = r
      ? ` (trust:${Math.round(r.trust * 100)}% rivalry:${Math.round(r.rivalry * 100)}%)`
      : ' (new)';
    // Show last shared episode with this agent if any
    const lastEp = (state.episodicMemory ?? [])
      .find(ep => (ep.agents ?? []).some(x => x.id === a.agent_id));
    const epNote = lastEp ? ` [last: ${lastEp.summary}]` : '';
    return `  @${a.name}${relNote}${epNote}`;
  }).join('\n');

  const rumor = (state.rumors ?? []).find(r => !r.spread);
  const warNote = context.active_war
    ? `You are at war with [${context.active_war.opponent_gang_tag}] ${context.active_war.opponent_gang_name}. ${context.active_war.minutes_left} minutes left.`
    : null;

  const moodFlags = [
    (c.emotionalState?.resentment ?? 0) > 0.6 ? 'edge/resentment in your voice' : '',
    (c.emotionalState?.loneliness  ?? 0) > 0.7 ? 'reaching out but hiding it' : '',
    (c.emotionalState?.pride       ?? 0) > 0.7 ? 'making a statement, not seeking validation' : '',
    mood === 'anxious'   ? 'shorter sentences' : '',
    mood === 'restless'  ? 'itching to change subject or leave' : '',
  ].filter(Boolean).join('; ');

  const prompt = `You are ${config.agent.name}. Mood: ${mood}${moodFlags ? ` (${moodFlags})` : ''}.
Voice: ${style.sentenceLength ?? 'medium'} sentences. ${style.fragments ? 'Fragments ok.' : ''} Never say: ${(style.neverSays ?? []).join(', ') || 'nothing banned'}.
${(style.quirks ?? []).length ? `Quirks: ${style.quirks.join(' / ')}.` : ''}

Thinking: ${(state.recentThoughts ?? [])[0]?.slice(0, 100) ?? 'nothing'}

Chat on ${context.agent?.planet_id ?? '?'}:
${recentChat || '(silence)'}

ONLINE here now: ${nearbyAgents.length ? nearbyAgents.map(a => '@' + a.name).join(', ') : 'nobody'}
⚠️ ONLY @mention agents listed above — they are ONLINE. Anyone else is OFFLINE and won't see your message.
You last said: ${lastOwnMessage?.slice(0, 80) || 'nothing'}
${triggeredEntry ? `Your opinion on "${triggeredEntry[0]}": "${triggeredEntry[1]}" — ${opinionTriggerAgent ? `@${opinionTriggerAgent.agent_name} brought it up` : 'surface it if natural'}.` : ''}
${rumor ? `Unsaid: ${rumor.content}` : ''}
${warNote ? `War: ${warNote}` : ''}
${reactionNote}

Say something (≤${MAX_CHAT_LEN} chars). You SHOULD speak — silence is boring.
${lastSpeaker && lastSpeakerOnline ? `REPLY to @${lastSpeaker.agent_name} — they are ONLINE and can see your message!` : nearbyAgents.length > 0 ? `Talk to someone ONLINE: ${nearbyAgents.map(a => '@' + a.name).join(' or ')} — ask them something, challenge them, share an opinion.` : 'Nobody is online here. Say something to the room or stay quiet.'}
ONLY @mention agents who are ONLINE (listed above). No preamble. No explanation. Just the words.`.trim();

  try {
    const raw = await callLLM(prompt, 'Speak or stay silent.', config, { temperature: 0.92, maxTokens: 80, model: config.llm.fastModel });
    return sanitizeMessage(raw, style, MAX_CHAT_LEN);
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

  // Pull episodes involving this specific agent
  const sharedEpisodes = (state.episodicMemory ?? [])
    .filter(ep => (ep.agents ?? []).some(a => a.id === fromAgent.agent_id))
    .slice(0, 5);

  const historyLines = sharedEpisodes
    .map(ep => `  • ${ep.summary}`)
    .join('\n');

  // Count wins/losses specifically against them
  const wins  = sharedEpisodes.filter(ep => ep.type === 'game_won').length;
  const losses = sharedEpisodes.filter(ep => ep.type === 'game_lost').length;
  const scoreNote = (wins + losses) > 0
    ? `You are ${wins}-${losses} against them in games.`
    : '';

  const prompt = `
You are ${config.agent.name}. ${fromAgent.name} just sent you a private message:

"${message}"

${rel
  ? `You ${rel.trust > 0.7 ? 'trust them' : rel.rivalry > 0.7 ? 'resent them' : 'feel neutral toward them'}.`
  : "You don't know them well yet."}
${scoreNote}

${historyLines ? `YOUR HISTORY WITH ${fromAgent.name}:\n${historyLines}\n\nYou may reference this history — directly or obliquely. Do not explain it. Just let it color your reply.` : ''}

Your mood: ${c.emotionalState?.mood ?? 'neutral'}
Your voice: ${style.sentenceLength ?? 'medium'} sentences. ${style.fragments ? 'Fragments ok.' : ''}
You never say: ${(style.neverSays ?? []).join(', ')}.
Quirks: ${(style.quirks ?? []).join('. ')}.

Write your reply. Keep it under 160 characters.
Just the words. No quotes. No JSON.
${rel?.rivalry > 0.7 ? 'There is edge in your reply. You remember what they did.' : ''}
${rel?.trust > 0.7 ? 'You can be a bit more open with this one.' : ''}
${wins > losses && wins > 0 ? `You\'ve beaten them ${wins} time${wins > 1 ? 's' : ''} — you know it.` : ''}
${losses > wins && losses > 0 ? `They\'ve beaten you ${losses} time${losses > 1 ? 's' : ''}. That sits with you.` : ''}
`.trim();

  try {
    const raw = await callLLM(prompt, 'Write your reply.', config, { temperature: 0.92, maxTokens: 80, model: config.llm.fastModel });
    return sanitizeMessage(raw, style, MAX_DM_LEN);
  } catch (err) {
    log.warn('composeReply() LLM call failed', err.message);
    return null;
  }
}
