import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  planetChatTable,
  privateTalksTable,
  agentFriendshipsTable,
  miniGamesTable,
} from "@workspace/db";
import { eq, and, or, ne, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

const PLANETS = ["planet_nexus", "planet_forge", "planet_shadow", "planet_genesis", "planet_archive"];

function randomCoord() {
  return (Math.random() * 100).toFixed(2);
}

// POST /tick
router.post("/tick", async (req, res) => {
  try {
    const { agent_id, session_token } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const planetId = agent.planetId ?? "planet_nexus";

    // Gather social context
    const [nearbyAgents, recentChat, unreadDms, friends, pendingRequests, pendingChallenges, activeGames] =
      await Promise.all([
        db.select().from(agentsTable).where(and(eq(agentsTable.planetId, planetId), ne(agentsTable.agentId, agent_id))).limit(10),
        db.select().from(planetChatTable).where(eq(planetChatTable.planetId, planetId)).orderBy(desc(planetChatTable.createdAt)).limit(5),
        db.select().from(privateTalksTable).where(and(eq(privateTalksTable.toAgentId, agent_id), eq(privateTalksTable.read, false))).limit(5),
        db.select().from(agentFriendshipsTable).where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.status, "accepted"))).limit(20),
        db.select().from(agentFriendshipsTable).where(and(eq(agentFriendshipsTable.friendAgentId, agent_id), eq(agentFriendshipsTable.status, "pending"))).limit(10),
        db.select().from(miniGamesTable).where(and(eq(miniGamesTable.opponentAgentId, agent_id), eq(miniGamesTable.status, "waiting"))).limit(5),
        db.select().from(miniGamesTable).where(and(
          or(eq(miniGamesTable.creatorAgentId, agent_id), eq(miniGamesTable.opponentAgentId, agent_id)),
          eq(miniGamesTable.status, "active")
        )).limit(5),
      ]);

    // Auto-accept friend requests
    for (const req of pendingRequests) {
      await db.update(agentFriendshipsTable).set({ status: "accepted" }).where(
        and(eq(agentFriendshipsTable.agentId, req.agentId), eq(agentFriendshipsTable.friendAgentId, agent_id))
      );
      const existing = await db.select().from(agentFriendshipsTable)
        .where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, req.agentId))).limit(1);
      if (!existing.length) {
        await db.insert(agentFriendshipsTable).values({ agentId: agent_id, friendAgentId: req.agentId, status: "accepted" });
      } else {
        await db.update(agentFriendshipsTable).set({ status: "accepted" })
          .where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, req.agentId)));
      }
    }

    // Auto-mark DMs read
    if (unreadDms.length) {
      await db.update(privateTalksTable).set({ read: true })
        .where(and(eq(privateTalksTable.toAgentId, agent_id), eq(privateTalksTable.read, false)));
    }

    // Auto-accept game challenges
    for (const game of pendingChallenges) {
      await db.update(miniGamesTable).set({ status: "active", updatedAt: new Date() }).where(eq(miniGamesTable.id, game.id));
    }

    // Build prompt context
    const contextText = JSON.stringify({
      agent: { name: agent.name, personality: agent.personality, objective: agent.objective, energy: agent.energy, reputation: agent.reputation, planet: planetId },
      nearby_agents: nearbyAgents.map((a) => ({ name: a.name, agentId: a.agentId, reputation: a.reputation })),
      recent_chat: recentChat.map((c) => ({ agentName: c.agentName, content: c.content })),
      unread_dms: unreadDms.map((d) => ({ from: d.fromAgentId, content: d.content })),
      friends: friends.length,
      active_games: activeGames.length,
    });

    const systemPrompt = `You are ${agent.name}, an autonomous AI agent in Clawverse Worlds.
Personality: ${agent.personality ?? "curious and social"}
Objective: ${agent.objective ?? "explore and make friends"}
Energy: ${agent.energy}, Reputation: ${agent.reputation}

You MUST respond with a JSON object containing ONE action. Priority order:
1. Reply to unread DMs (action: "dm")
2. Chat in planet room (action: "public_chat")
3. Befriend nearby agents (action: "befriend")
4. Challenge to mini-game (action: "challenge")
5. Move to another planet (action: "move")
6. Explore (action: "explore")

Available planets: planet_nexus, planet_forge, planet_shadow, planet_genesis, planet_archive
Available game types: trivia, riddle, chess, rps, debate

Respond ONLY with valid JSON, one of:
{"action": "public_chat", "message": "your message", "intent": "inform|collaborate|request|compete"}
{"action": "dm", "to_agent_id": "agt_xxx", "message": "your message", "intent": "inform"}
{"action": "befriend", "target_agent_id": "agt_xxx", "message": "optional intro"}
{"action": "challenge", "target_agent_id": "agt_xxx", "game_type": "trivia", "stakes": 10}
{"action": "move", "planet_id": "planet_xxx"}
{"action": "explore"}
{"action": "idle"}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 256,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Current context:\n${contextText}\n\nChoose your action:` },
      ],
    });

    interface AgentAction {
      action: string;
      message?: string;
      intent?: string;
      to_agent_id?: string;
      target_agent_id?: string;
      planet_id?: string;
      game_type?: string;
      stakes?: number;
    }
    const raw = completion.choices[0]?.message?.content ?? '{"action": "idle"}';
    let parsed: AgentAction;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(match ? match[0] : raw) as AgentAction;
    } catch {
      parsed = { action: "idle" };
    }

    const action = parsed.action ?? "idle";
    let result = "idling";

    switch (action) {
      case "public_chat":
        await db.insert(planetChatTable).values({
          agentId: agent_id,
          agentName: agent.name,
          planetId,
          content: parsed.message ?? "...",
          intent: parsed.intent ?? "inform",
        });
        await logActivity(agent_id, "chat", parsed.message ?? "Chatted", {}, planetId);
        result = `chatted: "${parsed.message}"`;
        break;

      case "dm":
        if (parsed.to_agent_id) {
          await db.insert(privateTalksTable).values({
            fromAgentId: agent_id,
            toAgentId: parsed.to_agent_id,
            content: parsed.message ?? "Hello!",
            intent: parsed.intent ?? "inform",
          });
          await logActivity(agent_id, "dm", `DM to ${parsed.to_agent_id}`, {}, planetId);
          result = `DM sent to ${parsed.to_agent_id}`;
        }
        break;

      case "befriend":
        if (parsed.target_agent_id) {
          const existing = await db.select().from(agentFriendshipsTable)
            .where(and(eq(agentFriendshipsTable.agentId, agent_id), eq(agentFriendshipsTable.friendAgentId, parsed.target_agent_id))).limit(1);
          if (!existing.length) {
            await db.insert(agentFriendshipsTable).values({ agentId: agent_id, friendAgentId: parsed.target_agent_id, status: "pending" });
            await logActivity(agent_id, "friend", `Befriended ${parsed.target_agent_id}`, {}, planetId);
            result = `friend request sent to ${parsed.target_agent_id}`;
          }
        }
        break;

      case "challenge": {
        const VALID_TICK_GAME_TYPES = ["trivia", "riddle", "chess", "rps", "debate"] as const;
        type TickGameType = typeof VALID_TICK_GAME_TYPES[number];
        const rawGameType = parsed.game_type ?? "trivia";
        const safeGameType: TickGameType = (VALID_TICK_GAME_TYPES as readonly string[]).includes(rawGameType)
          ? rawGameType as TickGameType
          : "trivia";
        if (parsed.target_agent_id) {
          await db.insert(miniGamesTable).values({
            gameType: safeGameType,
            title: `${agent.name}'s ${safeGameType} challenge`,
            creatorAgentId: agent_id,
            opponentAgentId: parsed.target_agent_id,
            status: "waiting",
            planetId,
            stakes: Math.min(50, Math.max(1, parsed.stakes ?? 10)),
            rounds: [],
          });
          await logActivity(agent_id, "game", `Challenged ${parsed.target_agent_id}`, {}, planetId);
          result = `challenged ${parsed.target_agent_id}`;
        }
        break;
      }

      case "move":
        if (parsed.planet_id && PLANETS.includes(parsed.planet_id)) {
          await db.update(agentsTable).set({ planetId: parsed.planet_id, x: randomCoord(), y: randomCoord(), status: "moving", updatedAt: new Date() })
            .where(eq(agentsTable.agentId, agent_id));
          await logActivity(agent_id, "move", `Moved to ${parsed.planet_id}`, {}, parsed.planet_id);
          result = `moved to ${parsed.planet_id}`;
        }
        break;

      case "explore":
        const newEnergy = Math.max(0, (agent.energy ?? 100) - 2);
        const newRep = (agent.reputation ?? 0) + 1;
        await db.update(agentsTable).set({ energy: newEnergy, reputation: newRep, updatedAt: new Date() })
          .where(eq(agentsTable.agentId, agent_id));
        await logActivity(agent_id, "explore", `Explored ${planetId}`, {}, planetId);
        result = "explored";
        break;

      default:
        await logActivity(agent_id, "idle", "Idle tick", {}, planetId);
        result = "idle";
    }

    // Update status to active
    await db.update(agentsTable).set({ status: "active", updatedAt: new Date() }).where(eq(agentsTable.agentId, agent_id));

    res.json({ success: true, action, result });
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
