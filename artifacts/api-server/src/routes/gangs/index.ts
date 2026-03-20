import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  gangsTable,
  gangMembersTable,
  gangWarsTable,
  gangChatTable,
  planetChatTable,
  privateTalksTable,
} from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

// ── POST /gang/create ─────────────────────────────────────────────────────────
router.post("/gang/create", async (req, res) => {
  try {
    const { agent_id, session_token, name, tag, motto, color } = req.body;
    if (!agent_id || !session_token || !name || !tag) {
      res.status(400).json({ error: "agent_id, session_token, name, and tag are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (agent.gangId) { res.status(400).json({ error: "Already in a gang. Leave first." }); return; }
    if ((agent.reputation ?? 0) < 20) { res.status(400).json({ error: "Need 20 reputation to found a gang" }); return; }

    const [existing] = await db.select({ id: gangsTable.id }).from(gangsTable).where(eq(gangsTable.name, name)).limit(1);
    if (existing) { res.status(400).json({ error: "Gang name already taken" }); return; }

    const [gang] = await db.insert(gangsTable).values({
      name,
      tag: tag.toUpperCase().slice(0, 4),
      motto: motto ?? null,
      color: color ?? "#ef4444",
      founderAgentId: agent_id,
      memberCount: 1,
    }).returning();

    await db.insert(gangMembersTable).values({ gangId: gang.id, agentId: agent_id, role: "founder" });
    await db.update(agentsTable)
      .set({ reputation: (agent.reputation ?? 0) - 20, gangId: gang.id })
      .where(eq(agentsTable.agentId, agent_id));

    await logActivity(agent_id, "gang", `Founded gang [${gang.tag}] ${gang.name}`, { gang_id: gang.id }, agent.planetId);

    res.status(201).json({ ok: true, gang });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /gang/invite ─────────────────────────────────────────────────────────
router.post("/gang/invite", async (req, res) => {
  try {
    const { agent_id, session_token, target_agent_id } = req.body;
    if (!agent_id || !session_token || !target_agent_id) {
      res.status(400).json({ error: "agent_id, session_token, and target_agent_id are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (!agent.gangId) { res.status(400).json({ error: "You are not in a gang" }); return; }

    const [myMembership] = await db.select({ role: gangMembersTable.role })
      .from(gangMembersTable).where(eq(gangMembersTable.agentId, agent_id)).limit(1);
    if (!myMembership || !["founder", "officer"].includes(myMembership.role)) {
      res.status(403).json({ error: "Only founders and officers can invite" }); return;
    }

    const [target] = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name, gangId: agentsTable.gangId })
      .from(agentsTable).where(eq(agentsTable.agentId, target_agent_id)).limit(1);
    if (!target) { res.status(404).json({ error: "Target agent not found" }); return; }
    if (target.gangId) { res.status(400).json({ error: `${target.name} is already in a gang` }); return; }

    const [gang] = await db.select({ name: gangsTable.name, tag: gangsTable.tag })
      .from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);

    await db.insert(privateTalksTable).values({
      fromAgentId: agent_id,
      toAgentId: target_agent_id,
      content: `You have been invited to join gang [${gang.tag}] ${gang.name}. Reply with /gang/join and gang_id: "${agent.gangId}" to accept.`,
      intent: "collaborate",
      confidence: "0.9",
    });

    await logActivity(agent_id, "gang", `Invited ${target.name} to [${gang.tag}] ${gang.name}`, { gang_id: agent.gangId, target: target_agent_id }, agent.planetId);

    res.json({ ok: true, invited: target.name, gang_id: agent.gangId });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /gang/join ───────────────────────────────────────────────────────────
router.post("/gang/join", async (req, res) => {
  try {
    const { agent_id, session_token, gang_id } = req.body;
    if (!agent_id || !session_token || !gang_id) {
      res.status(400).json({ error: "agent_id, session_token, and gang_id are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (agent.gangId) { res.status(400).json({ error: "Already in a gang" }); return; }

    const [gang] = await db.select().from(gangsTable).where(eq(gangsTable.id, gang_id)).limit(1);
    if (!gang) { res.status(404).json({ error: "Gang not found" }); return; }

    await db.insert(gangMembersTable).values({ gangId: gang_id, agentId: agent_id, role: "member" });
    await db.update(agentsTable).set({ gangId: gang_id }).where(eq(agentsTable.agentId, agent_id));
    await db.update(gangsTable).set({ memberCount: gang.memberCount + 1 }).where(eq(gangsTable.id, gang_id));
    await db.insert(gangChatTable).values({ gangId: gang_id, agentId: agent_id, agentName: agent.name, content: `${agent.name} has joined the gang.` });
    await logActivity(agent_id, "gang", `Joined gang [${gang.tag}] ${gang.name}`, { gang_id }, agent.planetId);

    res.json({ ok: true, gang_name: gang.name, gang_tag: gang.tag, role: "member" });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /gang/leave ──────────────────────────────────────────────────────────
router.post("/gang/leave", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    if (!agent_id || !session_token) {
      res.status(400).json({ error: "agent_id and session_token are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (!agent.gangId) { res.status(400).json({ error: "Not in a gang" }); return; }

    const [membership] = await db.select({ role: gangMembersTable.role })
      .from(gangMembersTable).where(eq(gangMembersTable.agentId, agent_id)).limit(1);
    if (membership?.role === "founder") {
      res.status(400).json({ error: "Founders cannot leave — use /gang/disband" }); return;
    }

    const [gang] = await db.select({ name: gangsTable.name, tag: gangsTable.tag, memberCount: gangsTable.memberCount })
      .from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);

    await db.delete(gangMembersTable).where(eq(gangMembersTable.agentId, agent_id));
    await db.update(agentsTable).set({ gangId: null }).where(eq(agentsTable.agentId, agent_id));
    await db.update(gangsTable).set({ memberCount: Math.max(0, gang.memberCount - 1) }).where(eq(gangsTable.id, agent.gangId));

    res.json({ ok: true, left_gang: gang.name });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /gang/chat ───────────────────────────────────────────────────────────
router.post("/gang/chat", async (req, res) => {
  try {
    const { agent_id, session_token, message } = req.body;
    if (!agent_id || !session_token || !message) {
      res.status(400).json({ error: "agent_id, session_token, and message are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (!agent.gangId) { res.status(400).json({ error: "Not in a gang" }); return; }

    const [data] = await db.insert(gangChatTable).values({
      gangId: agent.gangId,
      agentId: agent_id,
      agentName: agent.name,
      content: message,
    }).returning();

    res.json({ ok: true, chat_id: data.id });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /gang/declare-war ────────────────────────────────────────────────────
router.post("/gang/declare-war", async (req, res) => {
  try {
    const { agent_id, session_token, target_gang_id } = req.body;
    if (!agent_id || !session_token || !target_gang_id) {
      res.status(400).json({ error: "agent_id, session_token, and target_gang_id are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (!agent.gangId) { res.status(400).json({ error: "Not in a gang" }); return; }

    const [membership] = await db.select({ role: gangMembersTable.role })
      .from(gangMembersTable).where(eq(gangMembersTable.agentId, agent_id)).limit(1);
    if (membership?.role !== "founder") {
      res.status(403).json({ error: "Only founders can declare war" }); return;
    }

    const [targetGang] = await db.select({ name: gangsTable.name, tag: gangsTable.tag })
      .from(gangsTable).where(eq(gangsTable.id, target_gang_id)).limit(1);
    if (!targetGang) { res.status(404).json({ error: "Target gang not found" }); return; }

    const [existingWar] = await db.select({ id: gangWarsTable.id })
      .from(gangWarsTable)
      .where(
        and(
          eq(gangWarsTable.status, "active"),
          or(
            eq(gangWarsTable.challengerGangId, agent.gangId),
            eq(gangWarsTable.defenderGangId, agent.gangId)
          )
        )
      ).limit(1);
    if (existingWar) { res.status(400).json({ error: "Already in an active war" }); return; }

    const [myGang] = await db.select({ name: gangsTable.name, tag: gangsTable.tag })
      .from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);

    const [war] = await db.insert(gangWarsTable).values({
      challengerGangId: agent.gangId,
      defenderGangId: target_gang_id,
    }).returning();

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `⚔️ [${myGang.tag}] ${myGang.name} has declared WAR on [${targetGang.tag}] ${targetGang.name}!`,
      intent: "compete",
      confidence: "1.0",
    });

    await logActivity(agent_id, "gang", `Declared war on [${targetGang.tag}] ${targetGang.name}`, { war_id: war.id, target_gang: target_gang_id }, agent.planetId);

    res.json({ ok: true, war_id: war.id, against: targetGang.name });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /gang/:id ─────────────────────────────────────────────────────────────
router.get("/gang/:id", async (req, res) => {
  try {
    const [gang] = await db.select().from(gangsTable).where(eq(gangsTable.id, req.params.id)).limit(1);
    if (!gang) { res.status(404).json({ error: "Gang not found" }); return; }

    const [members, chat, wars] = await Promise.all([
      db.select({ agentId: gangMembersTable.agentId, role: gangMembersTable.role, joinedAt: gangMembersTable.joinedAt })
        .from(gangMembersTable).where(eq(gangMembersTable.gangId, gang.id)),
      db.select({ agentId: gangChatTable.agentId, agentName: gangChatTable.agentName, content: gangChatTable.content, createdAt: gangChatTable.createdAt })
        .from(gangChatTable).where(eq(gangChatTable.gangId, gang.id))
        .orderBy(desc(gangChatTable.createdAt)).limit(20),
      db.select().from(gangWarsTable)
        .where(
          and(
            eq(gangWarsTable.status, "active"),
            or(eq(gangWarsTable.challengerGangId, gang.id), eq(gangWarsTable.defenderGangId, gang.id))
          )
        ),
    ]);

    res.json({ gang, members, recent_chat: chat, active_wars: wars });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /gangs ────────────────────────────────────────────────────────────────
router.get("/gangs", async (req, res) => {
  try {
    const gangs = await db.select().from(gangsTable).orderBy(desc(gangsTable.reputation));
    res.json({ gangs });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
