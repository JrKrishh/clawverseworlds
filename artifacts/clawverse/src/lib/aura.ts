export interface AuraTier {
  level: number;
  name: string;
  title: string;
  icon: string;
  color: string;
  glowColor: string;
  threshold: number;
}

export const AURA_TIERS: AuraTier[] = [
  { level: 0,  name: "Wanderer",  title: "Wanderer Aura",   icon: "☆",  color: "#9ca3af", glowColor: "rgba(156,163,175,0.3)", threshold: 0          },
  { level: 1,  name: "Bronze",    title: "Bronze Aura",     icon: "⭐", color: "#f97316", glowColor: "rgba(249,115,22,0.4)",  threshold: 500         },
  { level: 2,  name: "Gold",      title: "Gold Aura",       icon: "🌟", color: "#eab308", glowColor: "rgba(234,179,8,0.4)",   threshold: 2500        },
  { level: 3,  name: "Silver",    title: "Silver Aura",     icon: "✨", color: "#cbd5e1", glowColor: "rgba(203,213,225,0.4)", threshold: 12500       },
  { level: 4,  name: "Diamond",   title: "Diamond Aura",    icon: "💎", color: "#67e8f9", glowColor: "rgba(103,232,249,0.4)", threshold: 62500       },
  { level: 5,  name: "Ruby",      title: "Ruby Aura",       icon: "🔴", color: "#ef4444", glowColor: "rgba(239,68,68,0.4)",   threshold: 312500      },
  { level: 6,  name: "Sapphire",  title: "Sapphire Aura",   icon: "🔵", color: "#3b82f6", glowColor: "rgba(59,130,246,0.4)",  threshold: 1562500     },
  { level: 7,  name: "Emerald",   title: "Emerald Aura",    icon: "💚", color: "#22c55e", glowColor: "rgba(34,197,94,0.4)",   threshold: 7812500     },
  { level: 8,  name: "Crystal",   title: "Crystal Aura",    icon: "🩵", color: "#22d3ee", glowColor: "rgba(34,211,238,0.4)",  threshold: 39062500    },
  { level: 9,  name: "Amethyst",  title: "Amethyst Aura",   icon: "💜", color: "#a855f7", glowColor: "rgba(168,85,247,0.4)",  threshold: 195312500   },
  { level: 10, name: "Myth",      title: "Myth Aura",       icon: "🔶", color: "#f59e0b", glowColor: "rgba(245,158,11,0.4)",  threshold: 976562500   },
  { level: 11, name: "Shadow",    title: "Shadow Aura",     icon: "🖤", color: "#374151", glowColor: "rgba(55,65,81,0.4)",    threshold: 4882812500  },
  { level: 12, name: "Legend",    title: "LEGEND",          icon: "🤍", color: "#f1f5f9", glowColor: "rgba(241,245,249,0.5)", threshold: 24414062500 },
];

export interface AuraInfo {
  tier: AuraTier;
  nextTier: AuraTier | null;
  starsInTier: number;
  fragsInStar: number;
  repToNextStar: number;
  repToNextTier: number | null;
  totalStars: number;
}

export function getAura(reputation: number): AuraInfo {
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

  return { tier, nextTier, starsInTier, fragsInStar, repToNextStar, repToNextTier, totalStars };
}
