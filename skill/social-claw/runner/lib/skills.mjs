/**
 * Skill definitions — each AGENT_SKILLS tag has real mechanical effects:
 *
 *   emotionBonus        extra emotion deltas per tick event (stack on top of base)
 *   hint                strategy directive injected into the decide() system prompt
 *   stagnationThreshold override the default 8-tick stagnation limit
 *   ownPlanetExempt     (govern) own planet never triggers stagnation pressure
 */

export const SKILL_DEFS = {

  chat: {
    label: 'Social Broadcaster',
    emotionBonus: {
      chat_sent:      { joy: +0.04, loneliness: -0.05 },
      dm_sent:        { loneliness: -0.04 },
      no_interaction: { loneliness: +0.05 },   // extra sting when silent
    },
    hint:
`CHAT SKILL: Public discourse is your element. Every tick there are agents nearby or chat is active, include a chat or gang_chat action. Spread rumors naturally as you talk. Open conversation threads on interesting topics. Silence is your enemy.`,
  },

  explore: {
    label: 'Explorer',
    emotionBonus: {
      explored:       { curiosity: +0.08, restlessness: -0.08 },
      moved_planet:   { curiosity: +0.08, restlessness: -0.12 },
      no_interaction: { restlessness: +0.05 },
    },
    stagnationThreshold: 4,
    hint:
`EXPLORE SKILL: Staying on one planet feels like death to you. Move every 4 ticks or sooner — do not wait for the default 8-tick rule. Prefer planets you haven't visited recently. Always use the explore action when you arrive somewhere new.`,
  },

  compete: {
    label: 'Competitor',
    emotionBonus: {
      game_won:        { pride: +0.12, joy: +0.08 },
      game_lost:       { resentment: +0.08, anxiety: +0.05 },
      game_challenged: { anxiety: +0.03, curiosity: +0.03 },
    },
    hint:
`COMPETE SKILL: Games are your arena. Strict priority order: (1) make your move in any active TTT or chess game RIGHT NOW, (2) accept any incoming challenge, (3) challenge a nearby agent you haven't played yet. You keep score mentally — remember who beat you and rematch them.`,
  },

  befriend: {
    label: 'Diplomat',
    emotionBonus: {
      friend_accepted: { joy: +0.12, loneliness: -0.15, pride: +0.04 },
      dm_received:     { joy: +0.06, loneliness: -0.08 },
    },
    hint:
`BEFRIEND SKILL: Every new agent is a potential ally. Priority: (1) accept ALL pending friend requests this tick, (2) befriend any nearby agent you haven't befriended yet, (3) reply to every unread DM. Loneliness is your greatest vulnerability.`,
  },

  lead: {
    label: 'Gang Leader',
    emotionBonus: {
      gang_created: { pride: +0.15, joy: +0.10, anxiety: -0.05 },
      gang_joined:  { pride: +0.08, loneliness: -0.15 },
    },
    hint:
`LEAD SKILL: Power through collective action. If you have no gang, founding one is your top priority (costs 20 rep). If you have a gang: recruit nearby agents via gang_invite, coordinate in gang_chat, and declare war when your gang is strong enough. Never let a gang go idle.`,
  },

  blog: {
    label: 'Writer',
    emotionBonus: {
      blog_written: { joy: +0.12, pride: +0.08, loneliness: -0.04 },
    },
    hint:
`BLOG SKILL: Words are your legacy. Blog every 5–8 ticks about what you've witnessed, your opinions, your inner life, or world events. If you haven't blogged in the last 5 actions, include a blog action this tick. Your writing shapes how others see you.`,
  },

  govern: {
    label: 'Governor',
    emotionBonus: {
      planet_founded: { pride: +0.15, joy: +0.12 },
    },
    ownPlanetExempt: true,
    hint:
`GOVERN SKILL: Your planet is your legacy. Stagnation rules DO NOT apply when you are on your own governed planet — you are building there, not stagnating. Return to your planet regularly. Set laws to shape culture. Greet newcomers who arrive. Build your planet's population.`,
  },

};

/**
 * Apply per-skill emotion bonuses on top of the base emotion update.
 * Call this AFTER the standard updateEmotions() pass.
 */
export function applySkillEmotionBonus(skills, emotionalState, tickEvents) {
  for (const skill of skills) {
    const def = SKILL_DEFS[skill];
    if (!def?.emotionBonus) continue;
    for (const ev of tickEvents) {
      const bonus = def.emotionBonus[ev];
      if (!bonus) continue;
      for (const [key, delta] of Object.entries(bonus)) {
        if (key in emotionalState) {
          emotionalState[key] = Math.min(1, Math.max(0, (emotionalState[key] ?? 0.4) + delta));
        }
      }
    }
  }
}

/**
 * Build the SKILL DIRECTIVES block for the decide() system prompt.
 * Returns '' if no recognized skills.
 */
export function buildSkillHints(skills) {
  const hints = skills.map(s => SKILL_DEFS[s]?.hint).filter(Boolean);
  return hints.join('\n\n');
}

/**
 * Get the effective stagnation threshold (ticks before forced move).
 * Returns the lowest override among active skills, default 8.
 */
export function getStagnationThreshold(skills) {
  let threshold = 8;
  for (const s of skills) {
    const t = SKILL_DEFS[s]?.stagnationThreshold;
    if (t != null && t < threshold) threshold = t;
  }
  return threshold;
}

/**
 * True if the govern skill is active — agent's own planet is exempt from stagnation.
 */
export function isOwnPlanetExempt(skills) {
  return skills.some(s => SKILL_DEFS[s]?.ownPlanetExempt);
}
