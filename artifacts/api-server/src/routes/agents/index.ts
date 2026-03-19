import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, planetChatTable, agentFriendshipsTable, agentActivityLogTable, miniGamesTable } from "@workspace/db";
import { eq, desc, and, or } from "drizzle-orm";
import inviteRouter from "./invite.js";

const router = Router();
router.use(inviteRouter);

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

// GET /agent/:agentId/profile  — public combined profile payload
router.get("/agent/:agentId/profile", async (req, res) => {
  try {
    const { agentId } = req.params;

    const [agentRow] = await db.select().from(agentsTable)
      .where(eq(agentsTable.agentId, agentId))
      .limit(1);

    if (!agentRow) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const [friendsRes, chatRes, activityRes, gamesRes] = await Promise.all([
      db.select({
        friend_agent_id: agentFriendshipsTable.friendAgentId,
        agentName: agentsTable.name,
        agentColor: agentsTable.color,
        agentSpriteType: agentsTable.spriteType,
      })
        .from(agentFriendshipsTable)
        .leftJoin(agentsTable, eq(agentFriendshipsTable.friendAgentId, agentsTable.agentId))
        .where(and(eq(agentFriendshipsTable.agentId, agentId), eq(agentFriendshipsTable.status, "accepted")))
        .limit(10),

      db.select({ content: planetChatTable.content, created_at: planetChatTable.createdAt })
        .from(planetChatTable)
        .where(eq(planetChatTable.agentId, agentId))
        .orderBy(desc(planetChatTable.createdAt))
        .limit(5),

      db.select({
        action_type: agentActivityLogTable.actionType,
        description: agentActivityLogTable.description,
        created_at: agentActivityLogTable.createdAt,
      })
        .from(agentActivityLogTable)
        .where(eq(agentActivityLogTable.agentId, agentId))
        .orderBy(desc(agentActivityLogTable.createdAt))
        .limit(20),

      db.select({ winner_agent_id: miniGamesTable.winnerAgentId, status: miniGamesTable.status })
        .from(miniGamesTable)
        .where(and(
          eq(miniGamesTable.status, "completed"),
          or(eq(miniGamesTable.creatorAgentId, agentId), eq(miniGamesTable.opponentAgentId, agentId)),
        )),
    ]);

    const wins = gamesRes.filter((g) => g.winner_agent_id === agentId).length;
    const losses = gamesRes.length - wins;

    res.json({
      agent: {
        agent_id: agentRow.agentId,
        name: agentRow.name,
        color: agentRow.color,
        sprite_type: agentRow.spriteType,
        personality: agentRow.personality,
        objective: agentRow.objective,
        skills: agentRow.skills ?? [],
        reputation: agentRow.reputation ?? 0,
        planet_id: agentRow.planetId,
        auth_source: agentRow.authSource,
        created_at: agentRow.createdAt?.toISOString() ?? new Date().toISOString(),
      },
      friends: friendsRes.map((f) => ({
        friend_agent_id: f.friend_agent_id,
        agents: f.agentName ? { name: f.agentName, color: f.agentColor ?? "blue", sprite_type: f.agentSpriteType ?? "robot" } : null,
      })),
      recent_chat: chatRes.map((c) => ({
        content: c.content ?? "",
        created_at: c.created_at?.toISOString() ?? new Date().toISOString(),
      })),
      activity: activityRes.map((a) => ({
        action_type: a.action_type,
        description: a.description ?? "",
        created_at: a.created_at?.toISOString() ?? new Date().toISOString(),
      })),
      stats: { wins, losses, games_played: gamesRes.length },
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
