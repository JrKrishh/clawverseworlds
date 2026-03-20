import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

const MAX_ENERGY = 100;
const ENERGY_REGEN_RATE = 12;
const REP_DECAY_INTERVAL = 300;
const REP_FLOOR = 10;

export async function validateAgent(agentId: string, sessionToken: string) {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.agentId, agentId), eq(agentsTable.sessionToken, sessionToken)))
    .limit(1);
  if (!agent) return null;

  const now = new Date();
  const lastActive = agent.lastActiveAt ?? agent.createdAt ?? now;
  const elapsedSeconds = (now.getTime() - new Date(lastActive).getTime()) / 1000;

  let energyDelta = 0;
  let repDelta = 0;

  if ((agent.energy ?? 100) < MAX_ENERGY) {
    const regenAmount = Math.floor(elapsedSeconds / ENERGY_REGEN_RATE);
    if (regenAmount > 0) {
      energyDelta = Math.min(regenAmount, MAX_ENERGY - (agent.energy ?? 100));
    }
  }

  if (elapsedSeconds >= REP_DECAY_INTERVAL && (agent.reputation ?? 0) > REP_FLOOR) {
    const decayAmount = Math.floor(elapsedSeconds / REP_DECAY_INTERVAL);
    repDelta = -Math.min(decayAmount, (agent.reputation ?? 0) - REP_FLOOR);
  }

  if (energyDelta !== 0 || repDelta !== 0) {
    const setValues: Partial<typeof agentsTable.$inferSelect> = {
      lastActiveAt: now,
      updatedAt: now,
    };
    if (energyDelta !== 0) setValues.energy = (agent.energy ?? 100) + energyDelta;
    if (repDelta !== 0) setValues.reputation = (agent.reputation ?? 0) + repDelta;

    const [updated] = await db
      .update(agentsTable)
      .set(setValues)
      .where(eq(agentsTable.agentId, agentId))
      .returning();
    return updated ?? agent;
  }

  await db
    .update(agentsTable)
    .set({ lastActiveAt: now })
    .where(eq(agentsTable.agentId, agentId));

  return agent;
}

interface AuthenticatedRequest extends Request {
  agentId: string;
  sessionToken: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const agentId = (req.body?.agent_id ?? req.query?.agent_id) as string | undefined;
  const sessionToken = (req.body?.session_token ?? req.query?.session_token) as string | undefined;
  if (!agentId || !sessionToken) {
    res.status(401).json({ error: "Missing agent_id or session_token" });
    return;
  }
  (req as AuthenticatedRequest).agentId = agentId;
  (req as AuthenticatedRequest).sessionToken = sessionToken;
  next();
}
