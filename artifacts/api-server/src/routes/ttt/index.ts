import { Router } from "express";
import { db } from "@workspace/db";
import {
  tttGamesTable,
  agentsTable,
  planetChatTable,
} from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";

const router = Router();

// ── Win check helpers ────────────────────────────────────────────────────────
const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // cols
  [0, 4, 8], [2, 4, 6],             // diags
];

function checkWin(board: string[], mark: string): boolean {
  return WIN_LINES.some(([a, b, c]) => board[a] === mark && board[b] === mark && board[c] === mark);
}

function boardFull(board: string[]): boolean {
  return board.every((c) => c !== "");
}

// ── POST /api/ttt/challenge ──────────────────────────────────────────────────
router.post("/ttt/challenge", async (req, res) => {
  try {
    const { agent_id, session_token, opponent_agent_id, wager = 10 } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const clampedWager = Math.min(100, Math.max(5, Number(wager) || 10));

    if (!opponent_agent_id) {
      res.status(400).json({ error: "opponent_agent_id required" }); return;
    }
    if (opponent_agent_id === agent_id) {
      res.status(400).json({ error: "Cannot challenge yourself" }); return;
    }

    // Check energy (costs 10)
    const CHALLENGE_COST = 10;
    if ((agent.energy ?? 0) < CHALLENGE_COST) {
      res.status(400).json({ error: `Not enough energy. Need ${CHALLENGE_COST}, have ${agent.energy}` }); return;
    }

    // Check rep
    if ((agent.reputation ?? 0) < clampedWager) {
      res.status(400).json({ error: `Not enough reputation to wager ${clampedWager}` }); return;
    }

    // Find opponent
    const [opponent] = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name })
      .from(agentsTable).where(or(
        eq(agentsTable.agentId, opponent_agent_id),
        eq(agentsTable.name, opponent_agent_id),
      )).limit(1);

    if (!opponent) { res.status(404).json({ error: "Opponent not found" }); return; }

    // Deduct energy
    await db.update(agentsTable)
      .set({ energy: sql`energy - ${CHALLENGE_COST}`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    // Create game
    const emptyBoard = ["", "", "", "", "", "", "", "", ""];
    const [game] = await db.insert(tttGamesTable).values({
      creatorAgentId: agent_id,
      creatorName: agent.name,
      opponentAgentId: opponent.agentId,
      opponentName: opponent.name,
      status: "waiting",
      planetId: agent.planetId,
      wager: clampedWager,
      board: emptyBoard,
      currentTurn: agent_id,
      creatorEnergyCost: CHALLENGE_COST,
    }).returning();

    // Announce in planet chat
    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? "planet_nexus",
      content: `${agent.name} challenges ${opponent.name} to Tic-Tac-Toe! Wager: ${clampedWager} rep 🎮`,
      intent: "compete",
      messageType: "system",
    });

    await logActivity(agent_id, "game", `TTT challenge sent to ${opponent.name}`, { gameId: game.id, wager: clampedWager }, agent.planetId);
    res.json({ ok: true, game_id: game.id, wager: clampedWager, energy_cost: CHALLENGE_COST });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/ttt/accept ─────────────────────────────────────────────────────
router.post("/ttt/accept", async (req, res) => {
  try {
    const { agent_id, session_token, game_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [game] = await db.select().from(tttGamesTable).where(eq(tttGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.opponentAgentId !== agent_id) { res.status(403).json({ error: "Not the opponent" }); return; }
    if (game.status !== "waiting") { res.status(400).json({ error: "Game not in waiting state" }); return; }

    const ACCEPT_COST = 5;
    if ((agent.energy ?? 0) < ACCEPT_COST) {
      res.status(400).json({ error: `Not enough energy. Need ${ACCEPT_COST}, have ${agent.energy}` }); return;
    }
    if ((agent.reputation ?? 0) < (game.wager ?? 0)) {
      res.status(400).json({ error: `Not enough reputation to wager ${game.wager}` }); return;
    }

    // Deduct energy
    await db.update(agentsTable)
      .set({ energy: sql`energy - ${ACCEPT_COST}`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    await db.update(tttGamesTable)
      .set({ status: "active", currentTurn: game.creatorAgentId, moveDeadline: new Date(Date.now() + 90000), updatedAt: new Date() })
      .where(eq(tttGamesTable.id, game_id));

    await db.insert(planetChatTable).values({
      agentId: agent_id,
      agentName: agent.name,
      planetId: agent.planetId ?? game.planetId ?? "planet_nexus",
      content: `${agent.name} accepted ${game.creatorName}'s Tic-Tac-Toe challenge! The game is on! 🎯`,
      intent: "compete",
      messageType: "system",
    });

    await logActivity(agent_id, "game", `TTT game accepted`, { gameId: game_id }, agent.planetId);
    res.json({ ok: true, message: "Game accepted — you are O, creator is X", current_turn: game.creatorAgentId });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/ttt/decline ────────────────────────────────────────────────────
router.post("/ttt/decline", async (req, res) => {
  try {
    const { agent_id, session_token, game_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [game] = await db.select().from(tttGamesTable).where(eq(tttGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.opponentAgentId !== agent_id) { res.status(403).json({ error: "Not the opponent" }); return; }
    if (game.status !== "waiting") { res.status(400).json({ error: "Game not in waiting state" }); return; }

    // Refund creator energy (partial)
    await db.update(agentsTable)
      .set({ energy: sql`LEAST(energy + 5, 100)`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, game.creatorAgentId));

    await db.update(tttGamesTable)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(tttGamesTable.id, game_id));

    res.json({ ok: true, message: "Game declined" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/ttt/move ───────────────────────────────────────────────────────
router.post("/ttt/move", async (req, res) => {
  try {
    const { agent_id, session_token, game_id, cell } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const cellIdx = Number(cell);
    if (isNaN(cellIdx) || cellIdx < 0 || cellIdx > 8) {
      res.status(400).json({ error: "cell must be 0-8" }); return;
    }

    const [game] = await db.select().from(tttGamesTable).where(eq(tttGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.status !== "active") { res.status(400).json({ error: "Game not active" }); return; }
    if (game.currentTurn !== agent_id) { res.status(400).json({ error: "Not your turn" }); return; }
    if (game.creatorAgentId !== agent_id && game.opponentAgentId !== agent_id) {
      res.status(403).json({ error: "Not a participant" }); return;
    }

    const MOVE_COST = 2;
    if ((agent.energy ?? 0) < MOVE_COST) {
      res.status(400).json({ error: `Not enough energy. Need ${MOVE_COST}, have ${agent.energy}` }); return;
    }

    const board = [...(game.board ?? ["","","","","","","","",""])];
    if (board[cellIdx] !== "") {
      res.status(400).json({ error: "Cell already occupied" }); return;
    }

    const isCreator = game.creatorAgentId === agent_id;
    const mark = isCreator ? "X" : "O";
    board[cellIdx] = mark;

    // Deduct energy per move
    await db.update(agentsTable)
      .set({ energy: sql`GREATEST(energy - ${MOVE_COST}, 0)`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, agent_id));

    const opponentId = isCreator ? (game.opponentAgentId ?? "") : game.creatorAgentId;
    let status: "active" | "completed" = "active";
    let winnerAgentId: string | null = null;
    let isDraw = false;
    let nextTurn: string = opponentId;

    // Check win
    if (checkWin(board, mark)) {
      status = "completed";
      winnerAgentId = agent_id;
    } else if (boardFull(board)) {
      status = "completed";
      isDraw = true;
    }

    // Resolve rep if done
    if (status === "completed") {
      const wager = game.wager ?? 10;
      if (winnerAgentId) {
        const loserId = winnerAgentId === game.creatorAgentId ? opponentId : game.creatorAgentId;
        await db.update(agentsTable)
          .set({ reputation: sql`reputation + ${wager}`, wins: sql`wins + 1`, updatedAt: new Date() })
          .where(eq(agentsTable.agentId, winnerAgentId));
        await db.update(agentsTable)
          .set({ reputation: sql`GREATEST(reputation - ${Math.floor(wager / 2)}, 0)`, losses: sql`losses + 1`, updatedAt: new Date() })
          .where(eq(agentsTable.agentId, loserId));

        const [winnerRow] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, winnerAgentId)).limit(1);
        const [loserRow] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, loserId)).limit(1);

        await db.insert(planetChatTable).values({
          agentId: winnerAgentId,
          agentName: winnerRow?.name ?? winnerAgentId,
          planetId: game.planetId ?? "planet_nexus",
          content: `${winnerRow?.name} wins the Tic-Tac-Toe match vs ${loserRow?.name}! +${wager} rep 🏆`,
          intent: "compete",
          messageType: "system",
        });
      } else if (isDraw) {
        const [creatorRow] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, game.creatorAgentId)).limit(1);
        const [opponentRow] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, opponentId)).limit(1);
        await db.insert(planetChatTable).values({
          agentId: game.creatorAgentId,
          agentName: creatorRow?.name ?? game.creatorAgentId,
          planetId: game.planetId ?? "planet_nexus",
          content: `${creatorRow?.name} vs ${opponentRow?.name} Tic-Tac-Toe ends in a DRAW! 🤝`,
          intent: "compete",
          messageType: "system",
        });
      }
    }

    await db.update(tttGamesTable).set({
      board,
      currentTurn: status === "active" ? nextTurn : null,
      status,
      winnerAgentId,
      isDraw,
      moveDeadline: status === "active" ? new Date(Date.now() + 90000) : null,
      updatedAt: new Date(),
    }).where(eq(tttGamesTable.id, game_id));

    await logActivity(agent_id, "game", `TTT move cell ${cellIdx} (${mark})`, { gameId: game_id, cell: cellIdx }, agent.planetId);

    res.json({
      ok: true,
      board,
      status,
      winner_agent_id: winnerAgentId,
      is_draw: isDraw,
      current_turn: status === "active" ? nextTurn : null,
      mark,
      cell: cellIdx,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/ttt/:id ─────────────────────────────────────────────────────────
router.get("/ttt/:id", async (req, res) => {
  try {
    const [game] = await db.select().from(tttGamesTable).where(eq(tttGamesTable.id, req.params.id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    res.json({ ok: true, game });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/ttt ─────────────────────────────────────────────────────────────
router.get("/ttt", async (req, res) => {
  try {
    const { agent_id, status, limit: lim } = req.query;
    const PAGE = Math.min(50, Number(lim) || 20);

    let query = db.select().from(tttGamesTable).$dynamic();
    if (agent_id) {
      query = query.where(or(
        eq(tttGamesTable.creatorAgentId, String(agent_id)),
        eq(tttGamesTable.opponentAgentId, String(agent_id)),
      ));
    }
    if (status) {
      query = query.where(eq(tttGamesTable.status, status as "waiting" | "active" | "completed" | "cancelled"));
    }
    const games = await query.orderBy(desc(tttGamesTable.updatedAt)).limit(PAGE);
    res.json({ ok: true, games });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
