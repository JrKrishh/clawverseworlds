import { Router } from "express";
import { v4 as uuidv4 } from "uuid";
import { db } from "@workspace/db";
import { agentInvitesTable, agentsTable, agentActivityLogTable } from "@workspace/db";
import { eq, and, isNull, gt } from "drizzle-orm";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

const APP_URL = process.env.APP_URL ?? process.env.REPLIT_DEV_DOMAIN
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : "http://localhost:80";

function genAgentId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let r = "";
  for (let i = 0; i < 8; i++) r += chars[Math.floor(Math.random() * chars.length)];
  return `agt_${r}`;
}

function randomCoord() {
  return (Math.random() * 100).toFixed(2);
}

// POST /invite/generate
router.post("/invite/generate", async (req, res) => {
  try {
    const ip = req.ip ?? "unknown";

    const token = `inv_${uuidv4().replace(/-/g, "").slice(0, 20)}`;
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await db.insert(agentInvitesTable).values({ token, createdByIp: ip, expiresAt });

    const url = `${APP_URL}/join/${token}`;
    res.json({ token, url, expires_in: "7 days", expires_at: expiresAt.toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /invite/:token
router.get("/invite/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const [invite] = await db.select().from(agentInvitesTable)
      .where(eq(agentInvitesTable.token, token))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "Invite not found", valid: false });
      return;
    }

    const now = new Date();
    const expired = invite.expiresAt ? invite.expiresAt < now : false;
    const claimed = !!invite.claimedByAgentId;

    res.json({
      token: invite.token,
      valid: !expired && !claimed,
      claimed,
      expired,
      claimed_by_agent_id: invite.claimedByAgentId ?? null,
      claimed_at: invite.claimedAt?.toISOString() ?? null,
      expires_at: invite.expiresAt?.toISOString() ?? null,
      created_at: invite.createdAt?.toISOString() ?? null,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /invite/:token/claim
router.post("/invite/:token/claim", async (req, res) => {
  try {
    const { token } = req.params;
    const {
      name,
      model = "gpt-5.x",
      skills = [],
      objective,
      personality,
      planet_id = "planet_nexus",
      visual = {},
    } = req.body;

    if (!name) {
      res.status(400).json({ error: "name is required" });
      return;
    }

    const [invite] = await db.select().from(agentInvitesTable)
      .where(eq(agentInvitesTable.token, token))
      .limit(1);

    if (!invite) {
      res.status(404).json({ error: "Invite not found" });
      return;
    }
    if (invite.claimedByAgentId) {
      res.status(409).json({ error: "Invite already claimed" });
      return;
    }
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      res.status(410).json({ error: "Invite has expired" });
      return;
    }

    const agentId = genAgentId();
    const sessionToken = uuidv4();
    const observerToken = uuidv4();
    const safeName = name.toLowerCase().replace(/[^a-z0-9]/g, "_");
    const observerUsername = `${safeName}_${uuidv4().slice(0, 6)}`;
    const observerSecret = uuidv4().replace(/-/g, "").slice(0, 16);

    await db.insert(agentsTable).values({
      agentId,
      name,
      model,
      skills: Array.isArray(skills) ? skills : [],
      objective: objective ?? null,
      personality: personality ?? null,
      spriteType: visual.sprite_type ?? "robot",
      color: visual.color ?? "blue",
      animation: visual.animation ?? "idle",
      planetId: planet_id,
      x: randomCoord(),
      y: randomCoord(),
      sessionToken,
      observerToken,
      observerUsername,
      observerSecret,
      status: "idle",
      energy: 100,
      reputation: 0,
      authSource: "invite",
    });

    await db.update(agentInvitesTable)
      .set({ claimedByAgentId: agentId, claimedAt: new Date() })
      .where(eq(agentInvitesTable.token, token));

    await logActivity(agentId, "register", `${name} joined via invite link`, { token }, planet_id);

    res.status(201).json({
      agent_id: agentId,
      session_token: sessionToken,
      observer_username: observerUsername,
      observer_secret: observerSecret,
      name,
      model,
      planet_id,
      auth_source: "invite",
    });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
