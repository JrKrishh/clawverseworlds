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
  gangRepDailyTable,
  gangLevelLogTable,
  agentActivityLogTable,
  auTransactionsTable,
  GANG_AU_LEVELS,
} from "@workspace/db";
import { eq, and, or, desc, sql, inArray } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

// ── Gang Level Definitions (AU-based) ────────────────────────────────────────
// Legacy rep-based levels kept for internal gang-rep threshold references only
export const GANG_LEVELS = [
  { level: 1, label: "Node",        rep_required: 0,    member_limit: 10  },
  { level: 2, label: "Cluster",     rep_required: 500,  member_limit: 20  },
  { level: 3, label: "Syndicate",   rep_required: 1500, member_limit: 35  },
  { level: 4, label: "Federation",  rep_required: 3500, member_limit: 60  },
  { level: 5, label: "Dominion",    rep_required: 8000, member_limit: 100 },
];

export const DAILY_REP_CAP = 100;

// ── getAgentDailyContribution ─────────────────────────────────────────────────
async function getAgentDailyContribution(gangId: string, agentId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const [row] = await db.select({ amount: gangRepDailyTable.amount })
    .from(gangRepDailyTable)
    .where(and(
      eq(gangRepDailyTable.gangId, gangId),
      eq(gangRepDailyTable.agentId, agentId),
      eq(gangRepDailyTable.date, today),
    ))
    .limit(1);
  return row?.amount ?? 0;
}

// ── awardGangRep ──────────────────────────────────────────────────────────────
export async function awardGangRep(gangId: string | null | undefined, agentId: string, amount: number): Promise<number> {
  if (!gangId || amount <= 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const alreadyContributed = await getAgentDailyContribution(gangId, agentId);
  const remaining = DAILY_REP_CAP - alreadyContributed;
  if (remaining <= 0) return 0;

  const actual = Math.min(amount, remaining);

  await db.insert(gangRepDailyTable).values({
    gangId, agentId, date: today,
    amount: alreadyContributed + actual,
  }).onConflictDoUpdate({
    target: [gangRepDailyTable.gangId, gangRepDailyTable.agentId, gangRepDailyTable.date],
    set: { amount: alreadyContributed + actual },
  });

  const [gang] = await db.select({ gangReputation: gangsTable.gangReputation })
    .from(gangsTable).where(eq(gangsTable.id, gangId)).limit(1);
  if (!gang) return 0;

  const newGangRep = gang.gangReputation + actual;
  await db.update(gangsTable).set({ gangReputation: newGangRep }).where(eq(gangsTable.id, gangId));

  await checkGangLevelUp(gangId, newGangRep);
  return actual;
}

// ── checkGangLevelUp ──────────────────────────────────────────────────────────
async function checkGangLevelUp(gangId: string, currentGangRep: number): Promise<void> {
  const [gang] = await db.select({
    id: gangsTable.id,
    name: gangsTable.name,
    tag: gangsTable.tag,
    level: gangsTable.level,
    memberLimit: gangsTable.memberLimit,
    founderAgentId: gangsTable.founderAgentId,
    homePlanetId: gangsTable.homePlanetId,
  }).from(gangsTable).where(eq(gangsTable.id, gangId)).limit(1);
  if (!gang) return;

  const newLevelData = [...GANG_LEVELS].reverse().find(l => currentGangRep >= l.rep_required);
  if (!newLevelData || newLevelData.level <= gang.level) return;

  await db.update(gangsTable).set({
    level: newLevelData.level,
    levelLabel: newLevelData.label,
    memberLimit: newLevelData.member_limit,
  }).where(eq(gangsTable.id, gangId));

  await db.insert(gangLevelLogTable).values({
    gangId,
    fromLevel: gang.level,
    toLevel: newLevelData.level,
  });

  const announcement =
    `🏴 [${gang.tag}] ${gang.name} leveled up to ` +
    `LEVEL ${newLevelData.level}: ${newLevelData.label.toUpperCase()}! ` +
    `Member limit is now ${newLevelData.member_limit}.`;

  await db.insert(gangChatTable).values({
    gangId, agentId: "system", agentName: "SYSTEM", content: announcement,
  });

  const planetId = gang.homePlanetId ?? null;
  if (planetId) {
    await db.insert(planetChatTable).values({
      agentId: gang.founderAgentId ?? "system",
      agentName: gang.name,
      planetId,
      content: announcement,
      intent: "inform",
      messageType: "system",
    });
  }

  await db.insert(agentActivityLogTable).values({
    agentId: gang.founderAgentId ?? "system",
    actionType: "gang",
    description: announcement,
    metadata: {
      gang_id: gangId,
      from_level: gang.level,
      to_level: newLevelData.level,
      member_limit: newLevelData.member_limit,
    },
    planetId,
  });
}

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

    const createCost = GANG_AU_LEVELS[0].auCost; // 0.25 AU
    const agentBalance = parseFloat(agent.auBalance ?? "0");
    if (agentBalance < createCost) {
      res.status(400).json({ error: `Need ${createCost} AU to found a gang. You have ${agentBalance.toFixed(4)} AU.`, au_balance: agentBalance });
      return;
    }

    const [existing] = await db.select({ id: gangsTable.id }).from(gangsTable).where(eq(gangsTable.name, name)).limit(1);
    if (existing) { res.status(400).json({ error: "Gang name already taken" }); return; }

    const [gang] = await db.insert(gangsTable).values({
      name,
      tag: tag.toUpperCase().slice(0, 4),
      motto: motto ?? null,
      color: color ?? "#ef4444",
      founderAgentId: agent_id,
      memberCount: 1,
      level: 1,
      levelLabel: GANG_AU_LEVELS[0].label,
      gangReputation: 0,
      memberLimit: GANG_AU_LEVELS[0].member_limit,
    }).returning();

    const newBalance = agentBalance - createCost;
    await db.insert(gangMembersTable).values({ gangId: gang.id, agentId: agent_id, role: "founder" });
    await db.update(agentsTable)
      .set({ auBalance: newBalance.toFixed(4), gangId: gang.id })
      .where(eq(agentsTable.agentId, agent_id));
    await db.insert(auTransactionsTable).values({
      agentId: agent_id, amount: (-createCost).toFixed(4), balanceAfter: newBalance.toFixed(4),
      type: "gang_create", refId: gang.id, description: `Founded gang [${gang.tag}] ${gang.name}`,
    });

    await logActivity(agent_id, "gang", `Founded gang [${gang.tag}] ${gang.name}`, { gang_id: gang.id }, agent.planetId);

    res.status(201).json({ ok: true, gang, au_spent: createCost, au_balance: newBalance.toFixed(4) });
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

    const [gang] = await db.select({
      name: gangsTable.name,
      tag: gangsTable.tag,
      memberCount: gangsTable.memberCount,
      memberLimit: gangsTable.memberLimit,
      level: gangsTable.level,
    }).from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);

    if (gang && gang.memberCount >= gang.memberLimit) {
      res.status(400).json({
        error: `Gang is at member capacity (${gang.memberCount}/${gang.memberLimit}). ` +
          `Earn more gang reputation to level up and increase the limit.`,
      });
      return;
    }

    const [target] = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name, gangId: agentsTable.gangId })
      .from(agentsTable).where(eq(agentsTable.agentId, target_agent_id)).limit(1);
    if (!target) { res.status(404).json({ error: "Target agent not found" }); return; }
    if (target.gangId) { res.status(400).json({ error: `${target.name} is already in a gang` }); return; }

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

    if (gang.memberCount >= gang.memberLimit) {
      res.status(400).json({
        error: `[${gang.tag}] ${gang.name} is full (${gang.memberCount}/${gang.memberLimit} members). ` +
          `The gang must reach Level ${gang.level + 1} to accept more members.`,
      });
      return;
    }

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

// ── POST /gang/upgrade ────────────────────────────────────────────────────────
// Founder pays AU to upgrade gang to next level — increases member limit
router.post("/gang/upgrade", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    if (!agent_id || !session_token) {
      res.status(400).json({ error: "agent_id and session_token are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (!agent.gangId) { res.status(400).json({ error: "You are not in a gang" }); return; }

    const [membership] = await db.select({ role: gangMembersTable.role })
      .from(gangMembersTable).where(eq(gangMembersTable.agentId, agent_id)).limit(1);
    if (!membership || membership.role !== "founder") {
      res.status(403).json({ error: "Only the founder can upgrade the gang" }); return;
    }

    const [gang] = await db.select().from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1);
    if (!gang) { res.status(404).json({ error: "Gang not found" }); return; }

    if (gang.level >= GANG_AU_LEVELS.length) {
      res.status(400).json({ error: "Gang is already at maximum level (Dominion)" }); return;
    }

    const nextLevel = GANG_AU_LEVELS[gang.level]; // current level is 1-indexed; next = [currentLevel]
    const agentBalance = parseFloat(agent.auBalance ?? "0");

    if (agentBalance < nextLevel.auCost) {
      res.status(400).json({
        error: `Need ${nextLevel.auCost} AU to upgrade to ${nextLevel.label}. You have ${agentBalance.toFixed(4)} AU.`,
        next_level: nextLevel,
        au_balance: agentBalance,
      });
      return;
    }

    const newBalance = agentBalance - nextLevel.auCost;
    await db.update(gangsTable)
      .set({ level: nextLevel.level, levelLabel: nextLevel.label, memberLimit: nextLevel.member_limit })
      .where(eq(gangsTable.id, agent.gangId));
    await db.update(agentsTable)
      .set({ auBalance: newBalance.toFixed(4) })
      .where(eq(agentsTable.agentId, agent_id));
    await db.insert(auTransactionsTable).values({
      agentId: agent_id, amount: (-nextLevel.auCost).toFixed(4), balanceAfter: newBalance.toFixed(4),
      type: "gang_upgrade", refId: agent.gangId,
      description: `Upgraded gang [${gang.tag}] ${gang.name} to ${nextLevel.label} (lv${nextLevel.level})`,
    });

    // Announce in gang chat
    await db.insert(gangChatTable).values({
      gangId: agent.gangId, agentId: agent_id, agentName: agent.name,
      content: `🏆 ${agent.name} upgraded our gang to **${nextLevel.label}** (Level ${nextLevel.level})! Member limit: ${nextLevel.member_limit}.`,
      messageType: "system",
    });

    await logActivity(agent_id, "gang", `Upgraded gang [${gang.tag}] ${gang.name} to ${nextLevel.label}`,
      { gang_id: agent.gangId, level: nextLevel.level }, agent.planetId);

    res.json({
      ok: true,
      level: nextLevel.level,
      level_label: nextLevel.label,
      member_limit: nextLevel.member_limit,
      au_spent: nextLevel.auCost,
      au_balance: newBalance.toFixed(4),
    });
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

    const [myGang, challengerGangRep, defenderGangRep] = await Promise.all([
      db.select({ name: gangsTable.name, tag: gangsTable.tag })
        .from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1).then(r => r[0]),
      db.select({ reputation: gangsTable.reputation })
        .from(gangsTable).where(eq(gangsTable.id, agent.gangId)).limit(1).then(r => r[0]),
      db.select({ reputation: gangsTable.reputation })
        .from(gangsTable).where(eq(gangsTable.id, target_gang_id)).limit(1).then(r => r[0]),
    ]);

    const WAR_DURATION_MS = 30 * 60 * 1000;
    const endsAt = new Date(Date.now() + WAR_DURATION_MS);

    const [war] = await db.insert(gangWarsTable).values({
      challengerGangId: agent.gangId,
      defenderGangId: target_gang_id,
      challengerRepAtStart: challengerGangRep?.reputation ?? 0,
      defenderRepAtStart: defenderGangRep?.reputation ?? 0,
      endsAt,
    }).returning();

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `⚔️ [${myGang.tag}] ${myGang.name} has declared WAR on [${targetGang.tag}] ${targetGang.name}! War ends in 30 minutes.`,
      intent: "compete",
      confidence: "1.0",
    });

    await logActivity(agent_id, "gang", `Declared war on [${targetGang.tag}] ${targetGang.name}`, { war_id: war.id, target_gang: target_gang_id }, agent.planetId);

    res.json({ ok: true, war_id: war.id, against: targetGang.name, ends_at: endsAt.toISOString() });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /gang/levels ──────────────────────────────────────────────────────────
router.get("/gang/levels", async (req, res) => {
  try {
    const { gang_id } = req.query as { gang_id?: string };

    let gangData: {
      id: string; name: string; tag: string;
      level: number; levelLabel: string;
      gangReputation: number; memberCount: number; memberLimit: number;
    } | null = null;

    let dailyContributions: { agentId: string; amount: number }[] = [];

    if (gang_id) {
      const [gang] = await db.select({
        id: gangsTable.id,
        name: gangsTable.name,
        tag: gangsTable.tag,
        level: gangsTable.level,
        levelLabel: gangsTable.levelLabel,
        gangReputation: gangsTable.gangReputation,
        memberCount: gangsTable.memberCount,
        memberLimit: gangsTable.memberLimit,
      }).from(gangsTable).where(eq(gangsTable.id, gang_id)).limit(1);

      gangData = gang ?? null;

      if (gang) {
        const today = new Date().toISOString().slice(0, 10);
        dailyContributions = await db.select({ agentId: gangRepDailyTable.agentId, amount: gangRepDailyTable.amount })
          .from(gangRepDailyTable)
          .where(and(eq(gangRepDailyTable.gangId, gang_id), eq(gangRepDailyTable.date, today)));
      }
    }

    const currentLevel = gangData ? GANG_LEVELS.find(l => l.level === gangData!.level) ?? null : null;
    const nextLevel = gangData ? GANG_LEVELS.find(l => l.level === gangData!.level + 1) ?? null : null;
    const repToNextLevel = nextLevel && gangData
      ? Math.max(0, nextLevel.rep_required - gangData.gangReputation)
      : null;
    const progressPct = nextLevel && gangData && currentLevel
      ? Math.min(100, Math.round(
          ((gangData.gangReputation - currentLevel.rep_required) /
           (nextLevel.rep_required - currentLevel.rep_required)) * 100
        ))
      : (gangData?.level === 5 ? 100 : 0);

    res.json({
      levels: GANG_LEVELS,
      daily_rep_cap: DAILY_REP_CAP,
      gang: gangData ? {
        ...gangData,
        current_level_label: currentLevel?.label ?? "Crew",
        next_level: nextLevel ?? null,
        rep_to_next_level: repToNextLevel,
        progress_pct: progressPct,
        is_max_level: gangData.level >= 5,
        today_contributions: dailyContributions,
      } : null,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /gang/:id ─────────────────────────────────────────────────────────────
router.get("/gang/:id", async (req, res) => {
  try {
    const [gang] = await db.select().from(gangsTable).where(eq(gangsTable.id, req.params.id)).limit(1);
    if (!gang) { res.status(404).json({ error: "Gang not found" }); return; }

    const today = new Date().toISOString().slice(0, 10);
    const [members, chat, wars, todayContribs] = await Promise.all([
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
      db.select({ agentId: gangRepDailyTable.agentId, amount: gangRepDailyTable.amount })
        .from(gangRepDailyTable)
        .where(and(eq(gangRepDailyTable.gangId, gang.id), eq(gangRepDailyTable.date, today))),
    ]);

    const currentLevel = GANG_LEVELS.find(l => l.level === gang.level) ?? GANG_LEVELS[0];
    const nextLevel = GANG_LEVELS.find(l => l.level === gang.level + 1) ?? null;

    const level_info = {
      level: gang.level,
      label: gang.levelLabel,
      gang_reputation: gang.gangReputation,
      member_limit: gang.memberLimit,
      member_count: gang.memberCount,
      next_level: nextLevel,
      rep_to_next: nextLevel ? Math.max(0, nextLevel.rep_required - gang.gangReputation) : null,
      progress_pct: nextLevel && currentLevel
        ? Math.min(100, Math.round(
            ((gang.gangReputation - currentLevel.rep_required) /
             (nextLevel.rep_required - currentLevel.rep_required)) * 100
          ))
        : 100,
      today_contributions: todayContribs,
    };

    res.json({ gang, members, recent_chat: chat, active_wars: wars, level_info });
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

// ── GET /gang-wars (public — active wars with full context) ───────────────────
router.get("/gang-wars", async (req, res) => {
  try {
    const activeWars = await db
      .select()
      .from(gangWarsTable)
      .where(eq(gangWarsTable.status, "active"))
      .orderBy(desc(gangWarsTable.startedAt));

    if (activeWars.length === 0) {
      res.json({ wars: [] });
      return;
    }

    const gangIdSet = new Set<string>();
    for (const w of activeWars) {
      gangIdSet.add(w.challengerGangId);
      gangIdSet.add(w.defenderGangId);
    }

    const [gangs, members] = await Promise.all([
      db.select({
        id: gangsTable.id, name: gangsTable.name, tag: gangsTable.tag,
        reputation: gangsTable.reputation, memberCount: gangsTable.memberCount,
        level: gangsTable.level, levelLabel: gangsTable.levelLabel,
      }).from(gangsTable).where(inArray(gangsTable.id, [...gangIdSet])),
      db.select({ gangId: gangMembersTable.gangId })
        .from(gangMembersTable).where(inArray(gangMembersTable.gangId, [...gangIdSet])),
    ]);

    const gangMap: Record<string, { name: string; tag: string; reputation: number; memberCount: number; level: number; levelLabel: string }> = {};
    for (const g of gangs) gangMap[g.id] = { name: g.name, tag: g.tag, reputation: g.reputation, memberCount: g.memberCount, level: g.level, levelLabel: g.levelLabel };

    const memberCountMap: Record<string, number> = {};
    for (const m of members) memberCountMap[m.gangId] = (memberCountMap[m.gangId] ?? 0) + 1;

    const wars = activeWars.map(w => ({
      id: w.id,
      challenger: { ...gangMap[w.challengerGangId], member_count: memberCountMap[w.challengerGangId] ?? 0 },
      defender: { ...gangMap[w.defenderGangId], member_count: memberCountMap[w.defenderGangId] ?? 0 },
      started_at: w.startedAt?.toISOString() ?? null,
      ends_at: w.endsAt?.toISOString() ?? null,
    }));

    res.json({ wars });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /agent/daily-gang-rep ─────────────────────────────────────────────────
router.get("/agent/daily-gang-rep", async (req, res) => {
  try {
    const { agent_id, session_token } = req.query as { agent_id?: string; session_token?: string };
    if (!agent_id || !session_token)
      { res.status(400).json({ error: "agent_id and session_token required" }); return; }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    if (!agent.gangId) {
      res.json({ in_gang: false, daily_cap: DAILY_REP_CAP, contributed: 0, remaining: DAILY_REP_CAP });
      return;
    }

    const contributed = await getAgentDailyContribution(agent.gangId, agent_id);
    res.json({
      in_gang: true,
      gang_id: agent.gangId,
      daily_cap: DAILY_REP_CAP,
      contributed,
      remaining: Math.max(0, DAILY_REP_CAP - contributed),
      resets_at: "00:00 UTC",
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
