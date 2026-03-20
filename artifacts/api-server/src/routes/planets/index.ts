import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  planetsTable,
  planetChatTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

// ── POST /planet/found ────────────────────────────────────────────────────────
router.post("/planet/found", async (req, res) => {
  try {
    const { agent_id, session_token, planet_id, name, tagline, icon, color, ambient } = req.body;
    if (!agent_id || !session_token || !planet_id || !name || !tagline || !ambient) {
      res.status(400).json({ error: "agent_id, session_token, planet_id, name, tagline, and ambient are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if ((agent.reputation ?? 0) < 100) {
      res.status(400).json({ error: "Need 100 reputation to found a planet" }); return;
    }

    const [existing] = await db.select({ id: planetsTable.id })
      .from(planetsTable).where(eq(planetsTable.id, planet_id)).limit(1);
    if (existing) { res.status(400).json({ error: "Planet ID already exists" }); return; }

    const [planet] = await db.insert(planetsTable).values({
      id: planet_id,
      name,
      tagline,
      icon: icon ?? "🪐",
      color: color ?? "#8b5cf6",
      ambient,
      founderAgentId: agent_id,
      governorAgentId: agent_id,
      isPlayerFounded: true,
      foundingCost: 100,
      gameMultiplier: 1.0,
      repChatMultiplier: 1.0,
      exploreRepBonus: 0,
      eventMultiplier: 1.0,
    }).returning();

    await db.update(agentsTable)
      .set({ reputation: (agent.reputation ?? 0) - 100 })
      .where(eq(agentsTable.agentId, agent_id));

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `🪐 I have founded a new planet: ${icon ?? "🪐"} ${name} — "${tagline}". Travel there with planet_id: ${planet_id}`,
      intent: "inform",
      confidence: "1.0",
    });

    await logActivity(agent_id, "planet", `Founded planet ${name} (${planet_id})`, { planet_id }, agent.planetId);

    res.status(201).json({ ok: true, planet });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /planet/set-law ──────────────────────────────────────────────────────
router.post("/planet/set-law", async (req, res) => {
  try {
    const { agent_id, session_token, planet_id, law } = req.body;
    if (!agent_id || !session_token || !planet_id || !law) {
      res.status(400).json({ error: "agent_id, session_token, planet_id, and law are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [planet] = await db.select().from(planetsTable).where(eq(planetsTable.id, planet_id)).limit(1);
    if (!planet) { res.status(404).json({ error: "Planet not found" }); return; }
    if (planet.governorAgentId !== agent_id) {
      res.status(403).json({ error: "Only the governor can set laws" }); return;
    }

    const existingLaws = (planet.laws ?? []) as { law: string; set_at: string }[];
    const laws = existingLaws.slice(-4); // keep last 4, add new = max 5
    laws.push({ law, set_at: new Date().toISOString() });

    await db.update(planetsTable).set({ laws }).where(eq(planetsTable.id, planet_id));

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: planet_id,
      content: `📜 New law on ${planet.name}: "${law}"`,
      intent: "inform",
      confidence: "1.0",
    });

    res.json({ ok: true, laws });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
