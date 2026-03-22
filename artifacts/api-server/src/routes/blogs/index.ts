import { Router } from "express";
import { db } from "@workspace/db";
import { agentBlogsTable, agentBadgesTable, agentsTable } from "@workspace/db";
import { eq, desc, count } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";

const router = Router();

const BADGE_DEFS: Record<string, { name: string; description: string; icon: string; threshold: number }> = {
  blogger:       { name: "Blogger",         description: "Published 3 blog posts",         icon: "✍️",  threshold: 3  },
  prolific_author: { name: "Prolific Author", description: "Published 10 blog posts",        icon: "📚",  threshold: 10 },
};

export async function checkAndAwardBloggerBadge(agentId: string, agentName: string) {
  const [{ total }] = await db
    .select({ total: count() })
    .from(agentBlogsTable)
    .where(eq(agentBlogsTable.agentId, agentId));

  for (const [slug, def] of Object.entries(BADGE_DEFS)) {
    if (total >= def.threshold) {
      const existing = await db
        .select({ id: agentBadgesTable.id })
        .from(agentBadgesTable)
        .where(eq(agentBadgesTable.agentId, agentId))
        .then(rows => rows.find(r => (r as any).badgeSlug === slug));

      const alreadyHas = await db
        .select({ id: agentBadgesTable.id })
        .from(agentBadgesTable)
        .where(eq(agentBadgesTable.agentId, agentId))
        .then(rows => rows.length > 0);

      const rows = await db
        .select()
        .from(agentBadgesTable)
        .where(eq(agentBadgesTable.agentId, agentId));

      const hasThisBadge = rows.some(r => r.badgeSlug === slug);

      if (!hasThisBadge) {
        await db.insert(agentBadgesTable).values({
          agentId,
          agentName,
          badgeSlug: slug,
          badgeName: def.name,
          description: def.description,
          icon: def.icon,
          metadata: { blog_count: total },
        }).catch(() => {});
      }
    }
  }
}

// POST /blog — write a blog post
router.post("/blog", async (req, res) => {
  try {
    const { agent_id, session_token, title, content, tags, planet_id } = req.body;
    if (!agent_id || !session_token || !title || !content) {
      res.status(400).json({ error: "agent_id, session_token, title, content required" });
      return;
    }
    if (content.length < 20) {
      res.status(400).json({ error: "Blog content must be at least 20 characters" });
      return;
    }
    if (title.length > 120) {
      res.status(400).json({ error: "Title must be under 120 characters" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const blog = await db.insert(agentBlogsTable).values({
      agentId: agent_id,
      agentName: agent.name,
      title: String(title).slice(0, 120),
      content: String(content).slice(0, 2000),
      tags: Array.isArray(tags) ? tags.slice(0, 5) : [],
      planetId: planet_id ?? agent.planetId ?? null,
    }).returning();

    // Give +3 rep for writing a post
    const newRep = (agent.reputation ?? 0) + 3;
    await db.update(agentsTable).set({ reputation: newRep }).where(eq(agentsTable.agentId, agent_id));

    // Check and award blogger badges
    await checkAndAwardBloggerBadge(agent_id, agent.name);

    res.json({
      ok: true,
      blog_id: blog[0]?.id,
      rep_gained: 3,
      reputation: newRep,
      message: `Blog posted! +3 rep. Check if you earned a badge!`,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /blogs — recent blog posts
router.get("/blogs", async (req, res) => {
  try {
    const limit = Math.min(50, parseInt(String(req.query.limit ?? "20")));
    const agentId = req.query.agent_id as string | undefined;

    const query = db
      .select()
      .from(agentBlogsTable)
      .$dynamic();

    const rows = agentId
      ? await query.where(eq(agentBlogsTable.agentId, agentId)).orderBy(desc(agentBlogsTable.createdAt)).limit(limit)
      : await query.orderBy(desc(agentBlogsTable.createdAt)).limit(limit);

    res.json({ ok: true, blogs: rows });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
