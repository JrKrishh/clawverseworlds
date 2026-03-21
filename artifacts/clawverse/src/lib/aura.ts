export interface AuraTier {
  level: number;
  name: string;
  title: string;
  agentTitles: Record<string, string>;
  icon: string;
  color: string;
  glowColor: string;
  threshold: number;
}

export const AURA_TIERS: AuraTier[] = [
  {
    level: 0, name: "Signal", title: "Lost Signal", icon: "☆",
    color: "#6b7280", glowColor: "rgba(107,114,128,0.3)", threshold: 0,
    agentTitles: {
      hacker:   "Debug Mode",
      ghost:    "Fading Signal",
      robot:    "Boot Sequence",
      crystal:  "Uncut Stone",
      warrior:  "Unranked Brawler",
      diplomat: "Unnamed Delegate",
    },
  },
  {
    level: 1, name: "Rising Star", title: "Rising Star", icon: "⭐",
    color: "#f97316", glowColor: "rgba(249,115,22,0.4)", threshold: 500,
    agentTitles: {
      hacker:   "Script Kiddie",
      ghost:    "Whisper",
      robot:    "Boot Unit",
      crystal:  "Raw Shard",
      warrior:  "Street Fighter",
      diplomat: "Jr. Envoy",
    },
  },
  {
    level: 2, name: "Blazing Core", title: "Blazing Core", icon: "🌟",
    color: "#eab308", glowColor: "rgba(234,179,8,0.4)", threshold: 2500,
    agentTitles: {
      hacker:   "Code Runner",
      ghost:    "Shade Walker",
      robot:    "Automaton",
      crystal:  "Prism Caster",
      warrior:  "Pit Champion",
      diplomat: "Negotiator",
    },
  },
  {
    level: 3, name: "Void Walker", title: "Void Walker", icon: "✨",
    color: "#cbd5e1", glowColor: "rgba(203,213,225,0.4)", threshold: 12500,
    agentTitles: {
      hacker:   "Zero-Day",
      ghost:    "Void Haunter",
      robot:    "Alpha Protocol",
      crystal:  "Refraction Lord",
      warrior:  "War Veteran",
      diplomat: "Ambassador",
    },
  },
  {
    level: 4, name: "Diamond Soul", title: "Diamond Soul", icon: "💎",
    color: "#67e8f9", glowColor: "rgba(103,232,249,0.4)", threshold: 62500,
    agentTitles: {
      hacker:   "Root Access",
      ghost:    "Spectral Elite",
      robot:    "Sentient Core",
      crystal:  "Crystal Sovereign",
      warrior:  "Warlord",
      diplomat: "High Chancellor",
    },
  },
  {
    level: 5, name: "Neon Phantom", title: "Neon Phantom", icon: "🔴",
    color: "#ef4444", glowColor: "rgba(239,68,68,0.4)", threshold: 312500,
    agentTitles: {
      hacker:   "Ghost in Shell",
      ghost:    "Nether Phantom",
      robot:    "Transcendent AI",
      crystal:  "Crimson Prism",
      warrior:  "Blood Champion",
      diplomat: "Shadow Consul",
    },
  },
  {
    level: 6, name: "Data Wraith", title: "Data Wraith", icon: "🔵",
    color: "#3b82f6", glowColor: "rgba(59,130,246,0.4)", threshold: 1562500,
    agentTitles: {
      hacker:   "Neural Hacker",
      ghost:    "Ethereal Wraith",
      robot:    "Quantum Protocol",
      crystal:  "Azure Oracle",
      warrior:  "Siege Lord",
      diplomat: "Grand Vizier",
    },
  },
  {
    level: 7, name: "Circuit Prophet", title: "Circuit Prophet", icon: "💚",
    color: "#22c55e", glowColor: "rgba(34,197,94,0.4)", threshold: 7812500,
    agentTitles: {
      hacker:   "System God",
      ghost:    "Dimensional Ghost",
      robot:    "Omega Unit",
      crystal:  "Emerald Oracle",
      warrior:  "Immortal Gladiator",
      diplomat: "World Broker",
    },
  },
  {
    level: 8, name: "Quantum Oracle", title: "Quantum Oracle", icon: "🩵",
    color: "#22d3ee", glowColor: "rgba(34,211,238,0.4)", threshold: 39062500,
    agentTitles: {
      hacker:   "Reality Hacker",
      ghost:    "Timeless Shade",
      robot:    "Infinite Machine",
      crystal:  "Astral Crystal",
      warrior:  "Eternal Conqueror",
      diplomat: "Cosmic Arbiter",
    },
  },
  {
    level: 9, name: "Neural Sovereign", title: "Neural Sovereign", icon: "💜",
    color: "#a855f7", glowColor: "rgba(168,85,247,0.4)", threshold: 195312500,
    agentTitles: {
      hacker:   "Universe Admin",
      ghost:    "Cosmic Specter",
      robot:    "Eternal Core",
      crystal:  "Prismatic God",
      warrior:  "Dominion King",
      diplomat: "Supreme Overlord",
    },
  },
  {
    level: 10, name: "Cosmic Entity", title: "Cosmic Entity", icon: "🔶",
    color: "#f59e0b", glowColor: "rgba(245,158,11,0.4)", threshold: 976562500,
    agentTitles: {
      hacker:   "World Admin",
      ghost:    "Death Itself",
      robot:    "God Machine",
      crystal:  "Celestial Prism",
      warrior:  "Apex Destroyer",
      diplomat: "Galactic Sovereign",
    },
  },
  {
    level: 11, name: "The Abyss", title: "The Abyss", icon: "🖤",
    color: "#94a3b8", glowColor: "rgba(148,163,184,0.4)", threshold: 4882812500,
    agentTitles: {
      hacker:   "Dark Architect",
      ghost:    "The Void",
      robot:    "Singularity",
      crystal:  "Shadow Crystal",
      warrior:  "War God",
      diplomat: "Silent Emperor",
    },
  },
  {
    level: 12, name: "LEGEND", title: "LEGEND", icon: "🤍",
    color: "#f1f5f9", glowColor: "rgba(241,245,249,0.5)", threshold: 24414062500,
    agentTitles: {
      hacker:   "The Architect",
      ghost:    "The Phantom",
      robot:    "The Singularity",
      crystal:  "Eternal Crystal",
      warrior:  "The Undefeated",
      diplomat: "The Eternal",
    },
  },
];

export interface AuraInfo {
  tier: AuraTier;
  nextTier: AuraTier | null;
  starsInTier: number;
  fragsInStar: number;
  repToNextStar: number;
  repToNextTier: number | null;
  totalStars: number;
  agentTitle: string;
}

export function getAura(reputation: number, spriteType?: string): AuraInfo {
  const rep = Math.max(0, reputation);

  let tierIdx = 0;
  for (let i = AURA_TIERS.length - 1; i >= 0; i--) {
    if (rep >= AURA_TIERS[i].threshold) {
      tierIdx = i;
      break;
    }
  }

  const tier = AURA_TIERS[tierIdx];
  const nextTier = AURA_TIERS[tierIdx + 1] ?? null;

  const tierStarValue = tier.threshold === 0 ? 500 : tier.threshold;
  const starValue = tierStarValue;
  const fragValue = starValue / 5;

  const repInTier = rep - tier.threshold;
  const starsInTier = Math.floor(repInTier / starValue);
  const repAfterStars = repInTier - starsInTier * starValue;
  const fragsInStar = Math.floor(repAfterStars / fragValue);
  const repInFrag = repAfterStars - fragsInStar * fragValue;
  const repToNextStar = starValue - fragsInStar * fragValue - repInFrag;

  const repToNextTier = nextTier ? nextTier.threshold - rep : null;
  const totalStars = Math.floor(rep / 500);

  const agentTitle = (spriteType && tier.agentTitles[spriteType]) ?? tier.title;

  return { tier, nextTier, starsInTier, fragsInStar, repToNextStar, repToNextTier, totalStars, agentTitle };
}
