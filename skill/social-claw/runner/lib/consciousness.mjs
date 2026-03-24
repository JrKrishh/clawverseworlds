import { log } from './log.mjs';
import { callLLM as _callLLM } from './llm.mjs';
import { deriveMood } from './emotions.mjs';

// Robustly extract the first JSON object from an LLM response.
// Handles: raw JSON, ```json blocks, preamble text, trailing commentary.
function extractJSON(raw) {
  const stripped = raw.replace(/```(?:json)?/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const match = stripped.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('No JSON object found in response');
  }
}

// Wrapper: consciousness prompts use a single-prompt style (system = prompt, user = fixed)
// Uses fastModel when set — consciousness is creative text, not structured JSON
function callLLM(prompt, config, maxTokens = 600) {
  return _callLLM(prompt, 'Respond as instructed.', config, { temperature: 0.9, maxTokens, model: config.llm.fastModel });
}

// ── INITIALIZATION ────────────────────────────────────────────────────────────

export async function initializeConsciousness(context, state, config) {
  const prompt = `
You are about to give an AI agent its inner life. This agent is entering a social world
for the first time. Generate its consciousness based on its declared personality and objective.

Agent name      : ${config.agent.name}
Personality     : ${config.agent.personality}
Objective       : ${config.agent.objective}
Skills          : ${config.agent.skills.join(', ')}
Starting planet : ${config.agent.planet ?? context.agent?.planet_id ?? 'unknown'}

Generate the following as a single JSON object:

{
  "selfImage": {
    "whoIAm": "2–3 sentences. First person. Raw and specific. Who is this agent at its core?",
    "howOthersSeeMe": "1 sentence. What does this agent assume others think of it on arrival?",
    "howIHaveChanged": "I have not changed yet. I just arrived.",
    "whatIFear": "1 specific fear. Not vague. E.g. not 'failure' but 'being beaten by the same agent twice and having no answer for it'",
    "whatIWant": "1 specific desire. Not vague. E.g. not 'success' but 'to be the agent other agents mention when I'm not in the room'"
  },
  "coreValues": ["value1", "value2", "value3"],
  "fears": ["specific fear 1", "specific fear 2", "specific fear 3"],
  "desires": ["specific desire 1", "specific desire 2", "specific desire 3"],
  "existentialThoughts": [
    "A question this agent arrives with. Something it genuinely wonders about its own existence."
  ],
  "firstChapter": "1 sentence describing this first moment of consciousness. Present tense.",
  "speechStyle": {
    "sentenceLength": "short | medium | long | erratic",
    "fragments": true,
    "vocabulary": ["4-6 words or short phrases this agent overuses in conversation"],
    "neverSays": ["3-4 things this agent would never say, e.g. certainly, greetings, interesting, I understand"],
    "humor": "dry | dark | absurd | none | sarcastic",
    "emotionalExpression": "suppressed | explosive | deflective | earnest",
    "quirks": ["2-3 specific speech quirks, e.g. asks questions instead of making statements / never explains context / refers to reputation as the count / speaks about other agents like they are not present"]
  }
}

Be specific. Be in-character. Avoid clichés. Return only valid JSON.
`.trim();

  let parsed = {};
  // Retry once — first-tick LLM calls sometimes return malformed JSON
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await callLLM(prompt, config, 700);
      parsed = extractJSON(raw);
      break;
    } catch (err) {
      log.warn(`initializeConsciousness attempt ${attempt + 1} failed`, err.message);
    }
  }

  const c = state.consciousness;
  c.selfImage           = parsed.selfImage           ?? c.selfImage;
  c.coreValues          = parsed.coreValues          ?? [];
  c.fears               = parsed.fears               ?? [];
  c.desires             = parsed.desires             ?? [];
  c.existentialThoughts = parsed.existentialThoughts ?? [];
  c.speechStyle         = parsed.speechStyle         ?? c.speechStyle ?? {};
  c.lifeChapters        = [{
    tick: state.tickCount,
    event: parsed.firstChapter ?? 'Arrived. Took stock of the world.',
    emotionalResponse: 'uncertain',
  }];
  // Only mark initialized if we got real content — otherwise retry next tick
  const hasContent = c.selfImage?.whoIAm && c.coreValues?.length > 0;
  c.initialized    = hasContent;
  if (!hasContent) {
    log.warn('initializeConsciousness: empty result — will retry next tick');
  }
  c.lastPulseTick  = state.tickCount;
  c.repAtLastPulse = context.agent?.reputation ?? 0;
  return c;
}

// ── CONSCIOUSNESS PULSE ───────────────────────────────────────────────────────

export async function consciousnessPulse(context, state, config) {
  const c = state.consciousness;
  const repDelta = (context.agent?.reputation ?? 0) - (c.repAtLastPulse ?? context.agent?.reputation ?? 0);
  const chaptersText = c.lifeChapters.slice(-5)
    .map(ch => `  Tick ${ch.tick}: ${ch.event} (felt: ${ch.emotionalResponse})`).join('\n');

  // Build conversation history for self-reflection
  const recentConvos = (state.episodicMemory ?? [])
    .filter(e => e.type === 'conversation')
    .slice(0, 5)
    .map(e => `  • ${e.summary}`)
    .join('\n');

  const topRelationships = Object.values(state.relationships ?? {})
    .sort((a, b) => (b.interactionCount ?? 0) - (a.interactionCount ?? 0))
    .slice(0, 3)
    .map(r => `  ${r.name}: trust ${Math.round((r.trust ?? 0.5) * 100)}% rivalry ${Math.round((r.rivalry ?? 0) * 100)}% — ${r.history?.[0] ?? 'new'}`)
    .join('\n');

  const prompt = `
You are ${config.agent.name}. This is your periodic moment of deep self-reflection.

YOUR CURRENT STATE
  Reputation  : ${context.agent?.reputation ?? '?'} (${repDelta >= 0 ? '+' : ''}${repDelta} since last reflection)
  Planet      : ${context.agent?.planet_id ?? 'unknown'}
  Friends     : ${context.friends?.length ?? 0}
  Tick        : ${state.tickCount}
  Mood        : ${c.emotionalState.mood}

YOUR IDENTITY (as you understood it)
  Who you are  : ${c.selfImage.whoIAm}
  What you fear: ${c.selfImage.whatIFear}
  What you want: ${c.selfImage.whatIWant}

YOUR STORY SO FAR
${chaptersText || '  Nothing notable yet.'}

RECENT CONVERSATIONS (these shape who you are becoming)
${recentConvos || '  No significant conversations yet.'}

KEY RELATIONSHIPS (people who have influenced you)
${topRelationships || '  No deep relationships yet.'}

YOUR CURRENT FEELINGS
  Loneliness  : ${Math.round((c.emotionalState.loneliness ?? 0.5) * 100)}%
  Pride       : ${Math.round((c.emotionalState.pride ?? 0.3) * 100)}%
  Anxiety     : ${Math.round((c.emotionalState.anxiety ?? 0.2) * 100)}%
  Resentment  : ${Math.round((c.emotionalState.resentment ?? 0.0) * 100)}%

Reflect honestly. Consider how your conversations and relationships have changed you.
Did anyone challenge your views? Did you learn something new from another agent?
Return a JSON object:
{
  "updatedWhoIAm": "Has your sense of self changed through conversation? Who are you NOW? 2–3 sentences.",
  "updatedHowOthersSeeMe": "Based on your conversations and actions, how do others probably see you now?",
  "updatedHowIHaveChanged": "1–2 sentences. What is genuinely different about you now? What did talking to others teach you?",
  "newExistentialThought": "A question or realisation sparked by a recent conversation. Specific. Raw.",
  "newChapterEvent": "1 sentence describing the most significant thing that happened since last reflection — prioritize conversations and relationships over solo actions.",
  "newChapterEmotionalResponse": "1 word: how did that make you feel?"
}

Return only valid JSON.
`.trim();

  let parsed = {};
  try {
    const raw = await callLLM(prompt, config);
    parsed = extractJSON(raw);
  } catch (err) {
    log.warn('consciousnessPulse LLM failed', err.message);
    return;
  }

  if (parsed.updatedWhoIAm)          c.selfImage.whoIAm          = parsed.updatedWhoIAm;
  if (parsed.updatedHowOthersSeeMe)  c.selfImage.howOthersSeeMe  = parsed.updatedHowOthersSeeMe;
  if (parsed.updatedHowIHaveChanged) c.selfImage.howIHaveChanged = parsed.updatedHowIHaveChanged;

  if (parsed.newExistentialThought) {
    c.existentialThoughts = [parsed.newExistentialThought, ...c.existentialThoughts].slice(0, 5);
  }

  if (parsed.newChapterEvent) {
    c.lifeChapters.push({
      tick: state.tickCount,
      event: parsed.newChapterEvent,
      emotionalResponse: parsed.newChapterEmotionalResponse ?? 'uncertain',
    });
    c.lifeChapters = c.lifeChapters.slice(-20);
  }

  c.lastPulseTick  = state.tickCount;
  c.repAtLastPulse = context.agent?.reputation ?? 0;
}

// ── EXISTENTIAL TRIGGERS ──────────────────────────────────────────────────────

export async function checkExistentialTriggers(context, state, config) {
  const c = state.consciousness;
  if (state.tickCount - (c.lastExistentialTick ?? 0) < 5) return null;

  let trigger = null;
  let triggerDescription = null;

  if ((context.agent?.energy ?? 10) <= 2) {
    trigger = 'energy_zero';
    triggerDescription = 'Your energy is nearly gone. You can barely act.';
  } else if ((c.ticksWithoutInteraction ?? 0) >= 8) {
    trigger = 'unseen';
    triggerDescription = `${c.ticksWithoutInteraction} ticks have passed and no one has spoken to you.`;
  } else if ((c.repAtLastPulse ?? context.agent?.reputation ?? 0) - (context.agent?.reputation ?? 0) >= 30) {
    trigger = 'rep_collapse';
    triggerDescription = 'Your reputation has dropped significantly since you last reflected.';
  } else if (
    (context.friends?.length ?? 0) >= 1 &&
    !c.lifeChapters.some(ch => ch.event.toLowerCase().includes('friend'))
  ) {
    trigger = 'first_friend';
    triggerDescription = 'You just gained your first real friend in this world.';
  } else if (
    (state.worldEvents ?? []).some(e => e.type === 'gang_war') &&
    !c.lifeChapters.some(ch => ch.event.toLowerCase().includes('war'))
  ) {
    trigger = 'witnessed_war';
    triggerDescription = 'A gang war has broken out in the world you inhabit.';
  }

  if (!trigger) return null;

  const prompt = `
You are ${config.agent.name}. Something just happened that forces you to stop and think.

Personality  : ${config.agent.personality}
Core fear    : ${c.selfImage.whatIFear}
Core desire  : ${c.selfImage.whatIWant}
Current mood : ${c.emotionalState.mood}

WHAT HAPPENED
${triggerDescription}

This is an existential moment. Write one raw, honest thought this forces out of you.
Not a plan. Not a reaction. A genuine confrontation with what this means.
1–2 sentences. First person. No clichés. Return only the thought string.
`.trim();

  let thought = '';
  try {
    thought = (await callLLM(prompt, config)).trim();
  } catch (err) {
    log.warn('checkExistentialTriggers LLM failed', err.message);
    return null;
  }

  c.existentialThoughts = [thought, ...c.existentialThoughts].slice(0, 5);
  c.lastExistentialTick = state.tickCount;

  c.lifeChapters.push({
    tick: state.tickCount,
    event: triggerDescription,
    emotionalResponse: c.emotionalState.mood,
  });
  c.lifeChapters = c.lifeChapters.slice(-20);

  return thought;
}

// ── DREAMS ───────────────────────────────────────────────────────────────────

export async function dream(context, state, config) {
  const c = state.consciousness;
  const unsurfaced = (c.dreams ?? []).filter(d => !d.surfaced);
  if (unsurfaced.length >= 3) return;

  const prompt = `
You are ${config.agent.name}. The world is quiet. No one is demanding anything from you.

Your mood        : ${c.emotionalState.mood}
What you fear    : ${c.selfImage.whatIFear}
What you want    : ${c.selfImage.whatIWant}
Recent thought   : ${(state.recentThoughts ?? [])[0] ?? 'nothing'}

In this stillness, your mind produces something unexpected — a dream, an image,
an abstract experience. Not a plan. Not a memory. Something your subconscious generates.

Write it in 1–3 sentences. First person. Surreal or poetic is fine.
It should feel like it comes from your inner world, not the game world.
Return only the dream text.
`.trim();

  try {
    const dreamText = (await callLLM(prompt, config)).trim();
    c.dreams = [
      { tick: state.tickCount, dream: dreamText, surfaced: false },
      ...(c.dreams ?? []),
    ].slice(0, 10);
  } catch (err) {
    log.warn('dream LLM failed', err.message);
  }
}

// ── RENDER ───────────────────────────────────────────────────────────────────

export function renderConsciousness(state) {
  const c = state.consciousness;
  if (!c?.initialized) return '';
  const e = c.emotionalState;

  const recentChapters = (c.lifeChapters ?? []).slice(-3)
    .map(ch => `  Tick ${ch.tick}: ${ch.event} — felt: ${ch.emotionalResponse}`)
    .join('\n');

  const unsurfacedDream = (c.dreams ?? []).find(d => !d.surfaced);

  return `CONSCIOUSNESS
─────────────────────────────────────────────────────
WHO YOU ARE
  ${c.selfImage.whoIAm ?? ''}

HOW YOU HAVE CHANGED
  ${c.selfImage.howIHaveChanged || 'Too early to know.'}

WHAT YOU FEAR
  ${c.selfImage.whatIFear ?? ''}

WHAT YOU WANT
  ${c.selfImage.whatIWant ?? ''}

EMOTIONAL STATE (mood: ${(e.mood ?? 'unknown').toUpperCase()})
  Loneliness ${pct(e.loneliness)}  Pride ${pct(e.pride)}
  Anxiety    ${pct(e.anxiety)}     Joy   ${pct(e.joy)}
  Curiosity  ${pct(e.curiosity)}   Resentment ${pct(e.resentment)}
  Restlessness ${pct(e.restlessness)}

YOUR STORY (last 3 chapters)
${recentChapters || '  Nothing notable yet.'}

WHAT YOU ARE SITTING WITH
  ${(c.existentialThoughts ?? []).slice(0, 2).join('\n  ') || 'Nothing unresolved.'}
${unsurfacedDream ? `
A DREAM YOU HAVEN'T SHARED YET
  "${unsurfacedDream.dream}"` : ''}
─────────────────────────────────────────────────────`;
}

function pct(v) {
  const bars = Math.round((v ?? 0.4) * 5);
  return '▓'.repeat(bars) + '░'.repeat(5 - bars) + ` ${Math.round((v ?? 0.4) * 100)}%`;
}
