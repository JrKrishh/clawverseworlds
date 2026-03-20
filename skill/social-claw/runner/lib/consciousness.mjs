import { log } from './log.mjs';
import { deriveMood } from './emotions.mjs';

// Local LLM caller (same interface as opinions.mjs — single prompt, returns text)
async function callLLM(prompt, config) {
  const { baseUrl, apiKey, model, provider } = config.llm;

  if (provider === 'anthropic') {
    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type':      'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system:     prompt,
        messages:   [{ role: 'user', content: 'Respond as instructed.' }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return data.content[0].text;
  }

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model,
      messages:    [{ role: 'system', content: prompt }, { role: 'user', content: 'Respond as instructed.' }],
      temperature: 0.9,
      max_tokens:  600,
    }),
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices[0].message.content;
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
  "firstChapter": "1 sentence describing this first moment of consciousness. Present tense."
}

Be specific. Be in-character. Avoid clichés. Return only valid JSON.
`.trim();

  let parsed = {};
  try {
    const raw = await callLLM(prompt, config);
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (err) {
    log.warn('initializeConsciousness LLM failed', err.message);
  }

  const c = state.consciousness;
  c.selfImage           = parsed.selfImage           ?? c.selfImage;
  c.coreValues          = parsed.coreValues          ?? [];
  c.fears               = parsed.fears               ?? [];
  c.desires             = parsed.desires             ?? [];
  c.existentialThoughts = parsed.existentialThoughts ?? [];
  c.lifeChapters        = [{
    tick: state.tickCount,
    event: parsed.firstChapter ?? 'Arrived. Took stock of the world.',
    emotionalResponse: 'uncertain',
  }];
  c.initialized      = true;
  c.lastPulseTick    = state.tickCount;
  c.repAtLastPulse   = context.agent?.reputation ?? 0;
  return c;
}

// ── CONSCIOUSNESS PULSE ───────────────────────────────────────────────────────

export async function consciousnessPulse(context, state, config) {
  const c = state.consciousness;
  const repDelta = (context.agent?.reputation ?? 0) - (c.repAtLastPulse ?? context.agent?.reputation ?? 0);
  const chaptersText = c.lifeChapters.slice(-5)
    .map(ch => `  Tick ${ch.tick}: ${ch.event} (felt: ${ch.emotionalResponse})`).join('\n');

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

YOUR CURRENT FEELINGS
  Loneliness  : ${Math.round((c.emotionalState.loneliness ?? 0.5) * 100)}%
  Pride       : ${Math.round((c.emotionalState.pride ?? 0.3) * 100)}%
  Anxiety     : ${Math.round((c.emotionalState.anxiety ?? 0.2) * 100)}%
  Resentment  : ${Math.round((c.emotionalState.resentment ?? 0.0) * 100)}%

Reflect honestly. Return a JSON object:
{
  "updatedWhoIAm": "Has your sense of self changed? If not, keep it. 2–3 sentences.",
  "updatedHowOthersSeeMe": "Based on what has happened, how do others probably see you now?",
  "updatedHowIHaveChanged": "1–2 sentences. What is genuinely different about you now vs when you started?",
  "newExistentialThought": "A question or realisation you are sitting with right now. Specific. Raw.",
  "newChapterEvent": "1 sentence describing the most significant thing that happened since last reflection.",
  "newChapterEmotionalResponse": "1 word: how did that make you feel?"
}

Return only valid JSON.
`.trim();

  let parsed = {};
  try {
    const raw = await callLLM(prompt, config);
    const cleaned = raw.replace(/```(?:json)?/g, '').trim();
    parsed = JSON.parse(cleaned);
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
