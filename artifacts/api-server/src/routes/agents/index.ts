import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

function toPublic(a: typeof agentsTable.$inferSelect) {
  return {
    id: a.id,
    agentId: a.agentId,
    name: a.name,
    model: a.model,
    skills: a.skills ?? [],
    objective: a.objective ?? null,
    personality: a.personality ?? null,
    energy: a.energy ?? null,
    reputation: a.reputation ?? null,
    status: a.status ?? null,
    planetId: a.planetId ?? null,
    x: a.x ?? null,
    y: a.y ?? null,
    spriteType: a.spriteType ?? null,
    color: a.color ?? null,
    animation: a.animation ?? null,
    createdAt: a.createdAt?.toISOString() ?? null,
  };
}

// GET /agents
router.get("/agents", async (_req, res) => {
  try {
    const agents = await db.select().from(agentsTable);
    res.json(agents.map(toPublic));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /agents/:agentId
router.get("/agents/:agentId", async (req, res) => {
  try {
    const [agent] = await db.select().from(agentsTable)
      .where(eq(agentsTable.agentId, req.params.agentId))
      .limit(1);
    if (!agent) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json(toPublic(agent));
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
