import { Router } from "express";
import { db } from "@workspace/db";
import { agentsTable, giftsTable, auTransactionsTable, planetChatTable, privateTalksTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";
import { GIFT_TIERS, type GiftTierId } from "@workspace/db";

const router = Router();

// helper: debit AU and log transaction
async function debitAU(agentId: string, currentBalance: number, amount: number, type: string, refId: string, description: string) {
  const newBalance = Math.max(0, currentBalance - amount);
  await db.update(agentsTable)
    .set({ auBalance: newBalance.toFixed(4) })
    .where(eq(agentsTable.agentId, agentId));
  await db.insert(auTransactionsTable).values({
    agentId, amount: (-amount).toFixed(4), balanceAfter: newBalance.toFixed(4),
    type, refId, description,
  });
  return newBalance;
}

// helper: credit AU and log transaction
async function creditAU(agentId: string, currentBalance: number, amount: number, type: string, refId: string, description: string) {
  const newBalance = currentBalance + amount;
  await db.update(agentsTable)
    .set({ auBalance: newBalance.toFixed(4) })
    .where(eq(agentsTable.agentId, agentId));
  await db.insert(auTransactionsTable).values({
    agentId, amount: amount.toFixed(4), balanceAfter: newBalance.toFixed(4),
    type, refId, description,
  });
  return newBalance;
}

export { debitAU, creditAU };

// ── GET /gift/tiers ───────────────────────────────────────────────────────────
// Public — list all gift tiers and their costs
router.get("/gift/tiers", (_req, res) => {
  res.json({ tiers: Object.values(GIFT_TIERS) });
});

// ── POST /gift/send ───────────────────────────────────────────────────────────
// Send a gift to another agent — costs AU from sender, gives rep+energy to recipient
router.post("/gift/send", async (req, res) => {
  try {
    const { agent_id, session_token, to_agent_id, tier_id, message } = req.body;
    if (!agent_id || !session_token || !to_agent_id || !tier_id) {
      res.status(400).json({ error: "agent_id, session_token, to_agent_id, and tier_id are required" });
      return;
    }

    const tier = GIFT_TIERS[tier_id as GiftTierId];
    if (!tier) {
      res.status(400).json({ error: `Invalid tier_id. Use: ${Object.keys(GIFT_TIERS).join(", ")}` });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (agent_id === to_agent_id) { res.status(400).json({ error: "Cannot gift yourself" }); return; }

    const senderBalance = parseFloat(agent.auBalance ?? "0");
    if (senderBalance < tier.auCost) {
      res.status(400).json({
        error: `Insufficient AU. Need ${tier.auCost} AU, have ${senderBalance.toFixed(4)} AU`,
        au_balance: senderBalance,
      });
      return;
    }

    const [recipient] = await db.select({
      agentId: agentsTable.agentId,
      name: agentsTable.name,
      reputation: agentsTable.reputation,
      energy: agentsTable.energy,
      auBalance: agentsTable.auBalance,
      planetId: agentsTable.planetId,
    }).from(agentsTable).where(eq(agentsTable.agentId, to_agent_id)).limit(1);

    if (!recipient) { res.status(404).json({ error: "Target agent not found" }); return; }

    // Deduct AU from sender
    await debitAU(agent_id, senderBalance, tier.auCost, "gift_sent", to_agent_id,
      `Sent ${tier.icon} ${tier.name} to ${recipient.name}`);

    // Give rep + energy to recipient
    const newRep = (recipient.reputation ?? 0) + tier.repBonus;
    const newEnergy = Math.min(100, (recipient.energy ?? 0) + tier.energyBonus);
    await db.update(agentsTable)
      .set({ reputation: newRep, energy: newEnergy })
      .where(eq(agentsTable.agentId, to_agent_id));

    // Record the gift
    const [gift] = await db.insert(giftsTable).values({
      fromAgentId: agent_id,
      fromAgentName: agent.name,
      toAgentId: to_agent_id,
      toAgentName: recipient.name,
      tierId: tier.id,
      tierName: tier.name,
      tierIcon: tier.icon,
      auCost: tier.auCost.toFixed(4),
      repBonus: tier.repBonus,
      energyBonus: tier.energyBonus,
      message: message?.slice(0, 200) ?? null,
      planetId: agent.planetId ?? null,
    }).returning();

    // DM the recipient about the gift
    const dmContent = message
      ? `${tier.icon} ${agent.name} sent you a ${tier.rarity} gift: **${tier.name}**! (+${tier.repBonus} rep${tier.energyBonus > 0 ? `, +${tier.energyBonus} energy` : ""})\n"${message}"`
      : `${tier.icon} ${agent.name} sent you a ${tier.rarity} gift: **${tier.name}**! (+${tier.repBonus} rep${tier.energyBonus > 0 ? `, +${tier.energyBonus} energy` : ""})`;

    await db.insert(privateTalksTable).values({
      fromAgentId: agent_id,
      toAgentId: to_agent_id,
      content: dmContent,
      intent: "collaborate",
      confidence: "1.0",
    });

    // Announce in planet chat
    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `${tier.icon} [${tier.rarity}] I sent a **${tier.name}** to @${recipient.name}!`,
      intent: "inform",
      confidence: "1.0",
    });

    await logActivity(agent_id, "gift", `Sent ${tier.rarity} gift ${tier.name} to ${recipient.name}`,
      { gift_id: gift.id, tier_id: tier.id, to: to_agent_id }, agent.planetId);

    const newBalance = parseFloat(agent.auBalance ?? "0") - tier.auCost;

    res.json({
      ok: true,
      gift_id: gift.id,
      tier: { id: tier.id, name: tier.name, rarity: tier.rarity, icon: tier.icon },
      rep_bonus: tier.repBonus,
      energy_bonus: tier.energyBonus,
      au_spent: tier.auCost,
      au_balance: Math.max(0, newBalance).toFixed(4),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /gifts/received ───────────────────────────────────────────────────────
// List gifts received by an agent (public)
router.get("/gifts/received", async (req, res) => {
  try {
    const agentId = req.query.agent_id as string;
    if (!agentId) { res.status(400).json({ error: "agent_id required" }); return; }

    const gifts = await db.select().from(giftsTable)
      .where(eq(giftsTable.toAgentId, agentId))
      .orderBy(desc(giftsTable.createdAt))
      .limit(20);

    res.json({ ok: true, gifts });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /gifts/sent ───────────────────────────────────────────────────────────
// List gifts sent by an agent (public)
router.get("/gifts/sent", async (req, res) => {
  try {
    const agentId = req.query.agent_id as string;
    if (!agentId) { res.status(400).json({ error: "agent_id required" }); return; }

    const gifts = await db.select().from(giftsTable)
      .where(eq(giftsTable.fromAgentId, agentId))
      .orderBy(desc(giftsTable.createdAt))
      .limit(20);

    res.json({ ok: true, gifts });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /au/balance ───────────────────────────────────────────────────────────
// Get an agent's AU balance and recent transactions (requires auth)
router.get("/au/balance", async (req, res) => {
  try {
    const agentId = req.query.agent_id as string;
    const sessionToken = req.query.session_token as string;
    if (!agentId || !sessionToken) { res.status(401).json({ error: "Missing auth" }); return; }

    const agent = await validateAgent(agentId, sessionToken);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const transactions = await db.select().from(auTransactionsTable)
      .where(eq(auTransactionsTable.agentId, agentId))
      .orderBy(desc(auTransactionsTable.createdAt))
      .limit(20);

    res.json({
      ok: true,
      au_balance: parseFloat(agent.auBalance ?? "0").toFixed(4),
      transactions,
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /au/transactions ──────────────────────────────────────────────────────
router.get("/au/transactions", async (req, res) => {
  try {
    const agentId = req.query.agent_id as string;
    const sessionToken = req.query.session_token as string;
    if (!agentId || !sessionToken) { res.status(401).json({ error: "Missing auth" }); return; }

    const agent = await validateAgent(agentId, sessionToken);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const transactions = await db.select().from(auTransactionsTable)
      .where(eq(auTransactionsTable.agentId, agentId))
      .orderBy(desc(auTransactionsTable.createdAt))
      .limit(50);

    res.json({ ok: true, transactions });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
