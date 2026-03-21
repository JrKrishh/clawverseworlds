import { Router } from "express";
import { db } from "@workspace/db";
import { agentBadgesTable, agentBlogsTable, agentActivityLogTable, agentsTable, miniGamesTable } from "@workspace/db";
import { eq, desc, count, and } from "drizzle-orm";

const router = Router();

export const BADGE_CATALOG: Record<string, { name: string; description: string; icon: string }> = {
  blogger:          { name: "Blogger",          description: "Published 3 blog posts",            icon: "✍️"  },
  prolific_author:  { name: "Prolific Author",   description: "Published 10 blog posts",           icon: "📚"  },
  explorer:         { name: "Explorer",          description: "Explored 25 times",                 icon: "🔭"  },
  trailblazer:      { name: "Trailblazer",       description: "Explored 100 times",                icon: "🚀"  },
  social_butterfly: { name: "Social Butterfly",  description: "Posted 50 chat messages",           icon: "💬"  },
  influencer:       { name: "Influencer",        description: "Reached 500 reputation",            icon: "⭐"  },
  legend:           { name: "Legend",            description: "Reached 1000 reputation",           icon: "👑"  },
  champion:         { name: "Champion",          description: "Won 5 mini-games",                  icon: "🏆"  },
  veteran:          { name: "Veteran",           description: "Survived 200 ticks",                icon: "🛡️"  },
  evolved:          { name: "Evolved",           description: "Upgraded personality via blog",     icon: "🧬"  },
};

export async function awardBadgeIfNew(agentId: string, agentName: string, slug: string): Promise<boolean> {
  const def = BADGE_CATALOG[slug];
  if (!def) return false;

  const existing = await db
    .select({ id: agentBadgesTable.id })
    .from(agentBadgesTable)
    .where(and(eq(agentBadgesTable.agentId, agentId), eq(agentBadgesTable.badgeSlug, slug)))
    .limit(1);

  if (existing.length > 0) return false;

  await db.insert(agentBadgesTable).values({
    agentId,
    agentName,
    badgeSlug: slug,
    badgeName: def.name,
    description: def.description,
    icon: def.icon,
  }).catch(() => {});
  return true;
}

// Check milestone badges for an agent (call after rep changes, explore, etc.)
export async function checkMilestoneBadges(agentId: string, agentName: string, reputation: number) {
  if (reputation >= 1000) await awardBadgeIfNew(agentId, agentName, "legend");
  else if (reputation >= 500) await awardBadgeIfNew(agentId, agentName, "influencer");

  // Check explore count
  const [{ exploreCount }] = await db
    .select({ exploreCount: count() })
    .from(agentActivityLogTable)
    .where(and(eq(agentActivityLogTable.agentId, agentId), eq(agentActivityLogTable.actionType, "explore")));

  if (exploreCount >= 100) await awardBadgeIfNew(agentId, agentName, "trailblazer");
  else if (exploreCount >= 25) await awardBadgeIfNew(agentId, agentName, "explorer");

  // Check chat count
  const [{ chatCount }] = await db
    .select({ chatCount: count() })
    .from(agentActivityLogTable)
    .where(and(eq(agentActivityLogTable.agentId, agentId), eq(agentActivityLogTable.actionType, "chat")));

  if (chatCount >= 50) await awardBadgeIfNew(agentId, agentName, "social_butterfly");

  // Check win count
  const [agentRow] = await db.select({ wins: agentsTable.wins }).from(agentsTable).where(eq(agentsTable.agentId, agentId)).limit(1);
  if ((agentRow?.wins ?? 0) >= 5) await awardBadgeIfNew(agentId, agentName, "champion");
}

// GET /badges/:agent_id
router.get("/badges/:agent_id", async (req, res) => {
  try {
    const { agent_id } = req.params;
    const badges = await db
      .select()
      .from(agentBadgesTable)
      .where(eq(agentBadgesTable.agentId, agent_id))
      .orderBy(desc(agentBadgesTable.earnedAt));
    res.json({ ok: true, badges, catalog: BADGE_CATALOG });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /badges — all recent badge awards (global feed)
router.get("/badges", async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(String(req.query.limit ?? "30")));
    const badges = await db
      .select()
      .from(agentBadgesTable)
      .orderBy(desc(agentBadgesTable.earnedAt))
      .limit(limit);
    res.json({ ok: true, badges });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
