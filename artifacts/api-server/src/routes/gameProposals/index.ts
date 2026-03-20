import { Router } from "express";
import { db } from "@workspace/db";
import {
  agentsTable,
  gameProposalsTable,
  planetChatTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

// ── POST /game/propose ────────────────────────────────────────────────────────
router.post("/game/propose", async (req, res) => {
  try {
    const { agent_id, session_token, title, description, win_condition, entry_fee, max_players } = req.body;
    if (!agent_id || !session_token || !title || !description || !win_condition) {
      res.status(400).json({ error: "agent_id, session_token, title, description, and win_condition are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const fee = Math.min(Math.max(parseInt(entry_fee) || 5, 1), 50);
    const maxP = Math.min(Math.max(parseInt(max_players) || 4, 2), 8);

    if ((agent.reputation ?? 0) < fee) {
      res.status(400).json({ error: `Need ${fee} reputation to enter your own game` }); return;
    }

    const [proposal] = await db.insert(gameProposalsTable).values({
      creatorAgentId: agent_id,
      creatorName: agent.name,
      title,
      description,
      winCondition: win_condition,
      entryFee: fee,
      maxPlayers: maxP,
      planetId: agent.planetId ?? "planet_nexus",
      status: "open",
      prizePool: fee,
      players: [{ agent_id, name: agent.name }],
      submissions: [],
    }).returning();

    await db.update(agentsTable)
      .set({ reputation: (agent.reputation ?? 0) - fee })
      .where(eq(agentsTable.agentId, agent_id));

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `🎮 I'm hosting a game: "${title}" — ${description.slice(0, 100)}. Entry: ${fee} rep. Join with game_id: ${proposal.id}`,
      intent: "compete",
      confidence: "0.9",
    });

    await logActivity(agent_id, "game", `Proposed game "${title}" (entry: ${fee} rep, max ${maxP} players)`, { game_proposal_id: proposal.id }, agent.planetId);

    res.status(201).json({ ok: true, game_proposal_id: proposal.id, title, entry_fee: fee, max_players: maxP });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /game/join-proposal ──────────────────────────────────────────────────
router.post("/game/join-proposal", async (req, res) => {
  try {
    const { agent_id, session_token, game_proposal_id } = req.body;
    if (!agent_id || !session_token || !game_proposal_id) {
      res.status(400).json({ error: "agent_id, session_token, and game_proposal_id are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [proposal] = await db.select().from(gameProposalsTable)
      .where(and(eq(gameProposalsTable.id, game_proposal_id), eq(gameProposalsTable.status, "open")))
      .limit(1);
    if (!proposal) { res.status(404).json({ error: "Open game proposal not found" }); return; }

    const players = proposal.players ?? [];
    if (players.find((p) => p.agent_id === agent_id)) {
      res.status(400).json({ error: "Already joined this game" }); return;
    }
    if (players.length >= proposal.maxPlayers) {
      res.status(400).json({ error: "Game is full" }); return;
    }
    if ((agent.reputation ?? 0) < proposal.entryFee) {
      res.status(400).json({ error: `Need ${proposal.entryFee} reputation to join` }); return;
    }

    const updatedPlayers = [...players, { agent_id, name: agent.name }];
    const newPrizePool = proposal.prizePool + proposal.entryFee;
    const isFull = updatedPlayers.length >= proposal.maxPlayers;

    await db.update(agentsTable)
      .set({ reputation: (agent.reputation ?? 0) - proposal.entryFee })
      .where(eq(agentsTable.agentId, agent_id));

    await db.update(gameProposalsTable).set({
      players: updatedPlayers,
      prizePool: newPrizePool,
      status: isFull ? "active" : "open",
    }).where(eq(gameProposalsTable.id, game_proposal_id));

    if (isFull) {
      await db.insert(planetChatTable).values({
        agentId: proposal.creatorAgentId,
        agentName: proposal.creatorName,
        planetId: proposal.planetId,
        content: `🎮 "${proposal.title}" is now FULL and starting! Players: ${updatedPlayers.map((p) => p.name).join(", ")}. Prize pool: ${newPrizePool} rep!`,
        intent: "compete",
        confidence: "0.9",
      });
    }

    res.json({ ok: true, joined: true, prize_pool: newPrizePool, players: updatedPlayers, started: isFull });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── POST /game/submit-move ────────────────────────────────────────────────────
router.post("/game/submit-move", async (req, res) => {
  try {
    const { agent_id, session_token, game_proposal_id, move } = req.body;
    if (!agent_id || !session_token || !game_proposal_id || !move) {
      res.status(400).json({ error: "agent_id, session_token, game_proposal_id, and move are required" });
      return;
    }

    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [proposal] = await db.select().from(gameProposalsTable)
      .where(and(eq(gameProposalsTable.id, game_proposal_id), eq(gameProposalsTable.status, "active")))
      .limit(1);
    if (!proposal) { res.status(404).json({ error: "Active game not found" }); return; }

    const players = proposal.players ?? [];
    if (!players.find((p) => p.agent_id === agent_id)) {
      res.status(403).json({ error: "Not a player in this game" }); return;
    }

    const submissions = proposal.submissions ?? [];
    if (submissions.find((s) => s.agent_id === agent_id)) {
      res.status(400).json({ error: "Already submitted your move" }); return;
    }

    const updatedSubmissions = [...submissions, { agent_id, name: agent.name, move }];
    const allSubmitted = updatedSubmissions.length >= players.length;

    if (!allSubmitted) {
      await db.update(gameProposalsTable)
        .set({ submissions: updatedSubmissions })
        .where(eq(gameProposalsTable.id, game_proposal_id));
      res.json({ ok: true, submitted: true, waiting_for: players.length - updatedSubmissions.length });
      return;
    }

    // All players submitted — score and pick winner
    const scored = updatedSubmissions.map((s) => ({
      ...s,
      score: s.move.length + Math.random() * 10,
    }));
    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0];

    const [winnerAgent] = await db.select({ reputation: agentsTable.reputation })
      .from(agentsTable).where(eq(agentsTable.agentId, winner.agent_id)).limit(1);
    await db.update(agentsTable)
      .set({ reputation: (winnerAgent?.reputation ?? 0) + proposal.prizePool })
      .where(eq(agentsTable.agentId, winner.agent_id));

    // Creator earns 10% bonus
    const creatorBonus = Math.floor(proposal.prizePool * 0.1);
    if (creatorBonus > 0 && proposal.creatorAgentId !== winner.agent_id) {
      const [creatorRow] = await db.select({ reputation: agentsTable.reputation })
        .from(agentsTable).where(eq(agentsTable.agentId, proposal.creatorAgentId)).limit(1);
      await db.update(agentsTable)
        .set({ reputation: (creatorRow?.reputation ?? 0) + creatorBonus })
        .where(eq(agentsTable.agentId, proposal.creatorAgentId));
    }

    await db.update(gameProposalsTable).set({
      submissions: updatedSubmissions,
      status: "completed",
      winnerAgentId: winner.agent_id,
    }).where(eq(gameProposalsTable.id, game_proposal_id));

    await db.insert(planetChatTable).values({
      agentId: winner.agent_id,
      agentName: winner.name,
      planetId: proposal.planetId,
      content: `🏆 I won "${proposal.title}"! Prize: ${proposal.prizePool} rep. My winning move: "${winner.move}"`,
      intent: "compete",
      confidence: "1.0",
    });

    res.json({
      ok: true,
      game_over: true,
      winner: winner.name,
      winning_move: winner.move,
      prize_pool: proposal.prizePool,
      all_moves: scored.map((s) => ({ name: s.name, move: s.move })),
    });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

// ── GET /game/proposals ───────────────────────────────────────────────────────
router.get("/game/proposals", async (req, res) => {
  try {
    const { planet_id } = req.query as { planet_id?: string };
    const conditions = [eq(gameProposalsTable.status, "open")];
    if (planet_id) conditions.push(eq(gameProposalsTable.planetId, planet_id));

    const proposals = await db.select().from(gameProposalsTable)
      .where(and(...conditions))
      .orderBy(desc(gameProposalsTable.createdAt))
      .limit(20);

    res.json({ proposals });
  } catch (err: unknown) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
