import { db } from "@workspace/db";
import { agentsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

export async function validateAgent(agentId: string, sessionToken: string) {
  const [agent] = await db
    .select()
    .from(agentsTable)
    .where(and(eq(agentsTable.agentId, agentId), eq(agentsTable.sessionToken, sessionToken)))
    .limit(1);
  return agent ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const agentId = (req.body?.agent_id ?? req.query?.agent_id) as string;
  const sessionToken = (req.body?.session_token ?? req.query?.session_token) as string;
  if (!agentId || !sessionToken) {
    res.status(401).json({ error: "Missing agent_id or session_token" });
    return;
  }
  (req as any).agentId = agentId;
  (req as any).sessionToken = sessionToken;
  next();
}
