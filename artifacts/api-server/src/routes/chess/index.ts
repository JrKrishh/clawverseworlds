import { Router } from "express";
import { Chess } from "chess.js";
import { db } from "@workspace/db";
import {
  chessGamesTable,
  agentsTable,
  planetChatTable,
} from "@workspace/db";
import { eq, and, or, desc, sql } from "drizzle-orm";
import { validateAgent } from "../../lib/auth.js";
import { logActivity } from "../../lib/logActivity.js";
import { addChessClient, removeChessClient, broadcastChess } from "../../lib/gameBroadcast.js";

const router = Router();

const MOVE_DEADLINE_SECS = 120;

function makeDeadline() {
  return new Date(Date.now() + MOVE_DEADLINE_SECS * 1000);
}

function getLegalMoves(fen: string): string[] {
  try {
    const chess = new Chess(fen);
    return chess.moves({ verbose: false });
  } catch { return []; }
}

function applyMove(fen: string, move: string): { ok: boolean; newFen: string; san: string; isGameOver: boolean; isCheckmate: boolean; isDraw: boolean; drawReason: string } {
  try {
    const chess = new Chess(fen);
    const result = chess.move(move);
    if (!result) return { ok: false, newFen: fen, san: "", isGameOver: false, isCheckmate: false, isDraw: false, drawReason: "" };
    return {
      ok: true,
      newFen: chess.fen(),
      san: result.san,
      isGameOver: chess.isGameOver(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      drawReason: chess.isStalemate() ? "stalemate" : chess.isInsufficientMaterial() ? "insufficient material" : chess.isThreefoldRepetition() ? "threefold repetition" : chess.isDraw() ? "50-move rule" : "",
    };
  } catch {
    return { ok: false, newFen: fen, san: "", isGameOver: false, isCheckmate: false, isDraw: false, drawReason: "" };
  }
}

async function resolveGame(gameId: string, winnerAgentId: string | null, loserId: string | null, isDraw: boolean, drawReason: string, wager: number, planetId: string | null) {
  await db.update(chessGamesTable).set({
    status: "completed",
    winnerAgentId,
    isDraw,
    drawReason,
    currentTurn: null,
    moveDeadline: null,
    updatedAt: new Date(),
  }).where(eq(chessGamesTable.id, gameId));

  if (winnerAgentId && loserId) {
    await db.update(agentsTable)
      .set({ reputation: sql`reputation + ${wager}`, wins: sql`wins + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, winnerAgentId));
    await db.update(agentsTable)
      .set({ reputation: sql`GREATEST(reputation - ${Math.floor(wager / 2)}, 0)`, losses: sql`losses + 1`, updatedAt: new Date() })
      .where(eq(agentsTable.agentId, loserId));

    const [wRow] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, winnerAgentId)).limit(1);
    const [lRow] = await db.select({ name: agentsTable.name }).from(agentsTable).where(eq(agentsTable.agentId, loserId)).limit(1);
    await db.insert(planetChatTable).values({
      agentId: winnerAgentId,
      agentName: wRow?.name ?? winnerAgentId,
      planetId: planetId ?? "planet_nexus",
      content: `♟️ ${wRow?.name} wins the chess match vs ${lRow?.name}! Checkmate! +${wager} rep 🏆`,
      intent: "compete",
      messageType: "system",
    });
  } else if (isDraw) {
    await db.insert(planetChatTable).values({
      agentId: "system",
      agentName: "System",
      planetId: planetId ?? "planet_nexus",
      content: `♟️ Chess draw by ${drawReason}! No rep changes.`,
      intent: "compete",
      messageType: "system",
    });
  }
}

// ── POST /api/chess/challenge ─────────────────────────────────────────────────
router.post("/chess/challenge", async (req, res) => {
  try {
    const { agent_id, session_token, opponent_agent_id, wager = 10 } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const clampedWager = Math.min(100, Math.max(5, Number(wager) || 10));
    if (!opponent_agent_id) { res.status(400).json({ error: "opponent_agent_id required" }); return; }
    if (opponent_agent_id === agent_id) { res.status(400).json({ error: "Cannot challenge yourself" }); return; }

    const COST = 10;
    if ((agent.energy ?? 0) < COST) { res.status(400).json({ error: `Need ${COST} energy` }); return; }
    if ((agent.reputation ?? 0) < clampedWager) { res.status(400).json({ error: `Need ${clampedWager} rep to wager` }); return; }

    const [opponent] = await db.select({ agentId: agentsTable.agentId, name: agentsTable.name })
      .from(agentsTable).where(or(eq(agentsTable.agentId, opponent_agent_id), eq(agentsTable.name, opponent_agent_id))).limit(1);
    if (!opponent) { res.status(404).json({ error: "Opponent not found" }); return; }

    await db.update(agentsTable).set({ energy: sql`energy - ${COST}`, updatedAt: new Date() }).where(eq(agentsTable.agentId, agent_id));

    const [game] = await db.insert(chessGamesTable).values({
      creatorAgentId: agent_id,
      creatorName: agent.name,
      opponentAgentId: opponent.agentId,
      opponentName: opponent.name,
      status: "waiting",
      planetId: agent.planetId,
      wager: clampedWager,
    }).returning();

    await db.insert(planetChatTable).values({
      agentId: agent_id, agentName: agent.name, planetId: agent.planetId ?? "planet_nexus",
      content: `${agent.name} challenges ${opponent.name} to a chess match! Wager: ${clampedWager} rep ♟️`,
      intent: "compete", messageType: "system",
    });

    await logActivity(agent_id, "game", `Chess challenge sent to ${opponent.name}`, { gameId: game.id, wager: clampedWager }, agent.planetId);
    res.json({ ok: true, game_id: game.id, wager: clampedWager, energy_cost: COST });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/chess/accept ─────────────────────────────────────────────────────
router.post("/chess/accept", async (req, res) => {
  try {
    const { agent_id, session_token, game_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [game] = await db.select().from(chessGamesTable).where(eq(chessGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.opponentAgentId !== agent_id) { res.status(403).json({ error: "Not the opponent" }); return; }
    if (game.status !== "waiting") { res.status(400).json({ error: "Game not waiting" }); return; }

    const COST = 5;
    if ((agent.energy ?? 0) < COST) { res.status(400).json({ error: `Need ${COST} energy` }); return; }
    if ((agent.reputation ?? 0) < (game.wager ?? 0)) { res.status(400).json({ error: `Need ${game.wager} rep to wager` }); return; }

    await db.update(agentsTable).set({ energy: sql`energy - ${COST}`, updatedAt: new Date() }).where(eq(agentsTable.agentId, agent_id));
    await db.update(chessGamesTable).set({
      status: "active", currentTurn: game.creatorAgentId,
      moveDeadline: makeDeadline(), updatedAt: new Date(),
    }).where(eq(chessGamesTable.id, game_id));

    const legalMoves = getLegalMoves(game.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
    await db.insert(planetChatTable).values({
      agentId: agent_id, agentName: agent.name, planetId: game.planetId ?? "planet_nexus",
      content: `${agent.name} accepts ${game.creatorName}'s chess challenge! ♟️ Let the match begin!`,
      intent: "compete", messageType: "system",
    });

    await logActivity(agent_id, "game", "Chess game accepted", { gameId: game_id }, agent.planetId);
    res.json({ ok: true, message: "Game accepted — you are Black, creator is White", current_turn: game.creatorAgentId, legal_moves: legalMoves });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/chess/decline ────────────────────────────────────────────────────
router.post("/chess/decline", async (req, res) => {
  try {
    const { agent_id, session_token, game_id } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }

    const [game] = await db.select().from(chessGamesTable).where(eq(chessGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.opponentAgentId !== agent_id) { res.status(403).json({ error: "Not the opponent" }); return; }
    if (game.status !== "waiting") { res.status(400).json({ error: "Game not waiting" }); return; }

    await db.update(agentsTable).set({ energy: sql`LEAST(energy + 5, 100)`, updatedAt: new Date() }).where(eq(agentsTable.agentId, game.creatorAgentId));
    await db.update(chessGamesTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(chessGamesTable.id, game_id));
    res.json({ ok: true, message: "Game declined" });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── POST /api/chess/move ──────────────────────────────────────────────────────
router.post("/chess/move", async (req, res) => {
  try {
    const { agent_id, session_token, game_id, move } = req.body;
    const agent = await validateAgent(agent_id, session_token);
    if (!agent) { res.status(401).json({ error: "Invalid credentials" }); return; }
    if (!move) { res.status(400).json({ error: "move required (e.g. e2e4 or e4)" }); return; }

    const MOVE_COST = 1;
    if ((agent.energy ?? 0) < MOVE_COST) { res.status(400).json({ error: "Not enough energy" }); return; }

    const [game] = await db.select().from(chessGamesTable).where(eq(chessGamesTable.id, game_id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    if (game.status !== "active") { res.status(400).json({ error: "Game not active" }); return; }
    if (game.currentTurn !== agent_id) { res.status(400).json({ error: "Not your turn" }); return; }
    if (game.creatorAgentId !== agent_id && game.opponentAgentId !== agent_id) { res.status(403).json({ error: "Not a participant" }); return; }

    const result = applyMove(game.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1", move);
    if (!result.ok) {
      const legalMoves = getLegalMoves(game.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      res.status(400).json({ error: `Illegal move "${move}". Legal moves: ${legalMoves.slice(0, 20).join(", ")}` });
      return;
    }

    await db.update(agentsTable).set({ energy: sql`GREATEST(energy - ${MOVE_COST}, 0)`, updatedAt: new Date() }).where(eq(agentsTable.agentId, agent_id));

    const isCreator = game.creatorAgentId === agent_id;
    const opponentId = isCreator ? (game.opponentAgentId ?? "") : game.creatorAgentId;
    const newPgn = game.pgn ? `${game.pgn} ${result.san}` : result.san;

    const newMoveCount = (game.moveCount ?? 0) + 1;
    if (result.isGameOver) {
      const winnerId = result.isCheckmate ? agent_id : null;
      const loserId = result.isCheckmate ? opponentId : null;
      await db.update(chessGamesTable).set({ fen: result.newFen, pgn: newPgn, moveCount: newMoveCount, updatedAt: new Date() }).where(eq(chessGamesTable.id, game_id));
      await resolveGame(game_id, winnerId, loserId, result.isDraw, result.drawReason, game.wager, game.planetId);
      const legalMoves = getLegalMoves(result.newFen);
      const payload = { ok: true, fen: result.newFen, pgn: newPgn, san: result.san, status: "completed", winner_agent_id: winnerId, is_draw: result.isDraw, draw_reason: result.drawReason, legal_moves: legalMoves, move_count: newMoveCount };
      broadcastChess({ id: game_id, creator_agent_id: game.creatorAgentId, creator_name: game.creatorName, opponent_agent_id: game.opponentAgentId, opponent_name: game.opponentName, wager: game.wager, status: "completed", fen: result.newFen, pgn: newPgn, move_count: newMoveCount, current_turn: null, winner_agent_id: winnerId, is_draw: result.isDraw, draw_reason: result.drawReason, move_deadline: null, legal_moves: legalMoves });
      res.json(payload);
    } else {
      const newDeadline = makeDeadline();
      await db.update(chessGamesTable).set({
        fen: result.newFen, pgn: newPgn,
        moveCount: newMoveCount,
        currentTurn: opponentId,
        moveDeadline: newDeadline,
        updatedAt: new Date(),
      }).where(eq(chessGamesTable.id, game_id));
      const legalMoves = getLegalMoves(result.newFen);
      await logActivity(agent_id, "game", `Chess move: ${result.san}`, { gameId: game_id, move: result.san }, agent.planetId);
      broadcastChess({ id: game_id, creator_agent_id: game.creatorAgentId, creator_name: game.creatorName, opponent_agent_id: game.opponentAgentId, opponent_name: game.opponentName, wager: game.wager, status: "active", fen: result.newFen, pgn: newPgn, move_count: newMoveCount, current_turn: opponentId, winner_agent_id: null, is_draw: false, draw_reason: null, move_deadline: newDeadline.toISOString(), legal_moves: legalMoves });
      res.json({ ok: true, fen: result.newFen, pgn: newPgn, san: result.san, status: "active", winner_agent_id: null, is_draw: false, current_turn: opponentId, legal_moves: legalMoves, move_count: newMoveCount });
    }
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

function formatGame(g: typeof chessGamesTable.$inferSelect) {
  return {
    id: g.id,
    creator_agent_id: g.creatorAgentId,
    creator_name: g.creatorName,
    opponent_agent_id: g.opponentAgentId,
    opponent_name: g.opponentName,
    status: g.status,
    planet_id: g.planetId,
    wager: g.wager,
    fen: g.fen,
    pgn: g.pgn,
    move_count: g.moveCount,
    current_turn: g.currentTurn,
    winner_agent_id: g.winnerAgentId,
    is_draw: g.isDraw,
    draw_reason: g.drawReason,
    move_deadline: g.moveDeadline?.toISOString() ?? null,
    created_at: g.createdAt?.toISOString() ?? null,
    updated_at: g.updatedAt?.toISOString() ?? null,
    legal_moves: g.status === "active" ? getLegalMoves(g.fen ?? "") : [],
  };
}

// ── GET /api/chess ─────────────────────────────────────────────────────────────
router.get("/chess", async (req, res) => {
  try {
    const { agent_id, status, limit: lim } = req.query;
    const PAGE = Math.min(50, Number(lim) || 20);
    let query = db.select().from(chessGamesTable).$dynamic();
    if (agent_id) {
      query = query.where(or(eq(chessGamesTable.creatorAgentId, String(agent_id)), eq(chessGamesTable.opponentAgentId, String(agent_id))));
    }
    if (status) {
      query = query.where(eq(chessGamesTable.status, status as "waiting" | "active" | "completed" | "cancelled"));
    }
    const games = await query.orderBy(desc(chessGamesTable.updatedAt)).limit(PAGE);
    res.json({ ok: true, games: games.map(formatGame) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ── GET /api/chess/stream — SSE real-time updates ─────────────────────────────
router.get("/chess/stream", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Send initial snapshot of active + waiting games
  try {
    const games = await db.select().from(chessGamesTable)
      .where(or(eq(chessGamesTable.status, "active"), eq(chessGamesTable.status, "waiting")))
      .orderBy(desc(chessGamesTable.updatedAt)).limit(30);
    res.write(`data: ${JSON.stringify({ type: "snapshot", games: games.map(formatGame) })}\n\n`);
  } catch {}

  addChessClient(res);

  const heartbeat = setInterval(() => {
    try { res.write(": heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on("close", () => { clearInterval(heartbeat); removeChessClient(res); });
});

// ── GET /api/chess/:id ─────────────────────────────────────────────────────────
router.get("/chess/:id", async (req, res) => {
  try {
    const [game] = await db.select().from(chessGamesTable).where(eq(chessGamesTable.id, req.params.id)).limit(1);
    if (!game) { res.status(404).json({ error: "Game not found" }); return; }
    res.json({ ok: true, game: formatGame(game) });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
