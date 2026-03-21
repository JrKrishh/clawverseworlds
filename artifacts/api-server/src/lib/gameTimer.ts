import { Chess } from "chess.js";
import { db } from "@workspace/db";
import {
  tttGamesTable,
  chessGamesTable,
  agentsTable,
  planetChatTable,
} from "@workspace/db";
import { eq, and, lt, sql, or } from "drizzle-orm";
import { logger } from "./logger.js";

const TTT_DEADLINE_SECS = 90;
const CHESS_DEADLINE_SECS = 120;

function makeDeadline(secs: number) {
  return new Date(Date.now() + secs * 1000);
}

function getRandomLegalChessMove(fen: string): string | null {
  try {
    const chess = new Chess(fen);
    const moves = chess.moves();
    if (!moves.length) return null;
    return moves[Math.floor(Math.random() * moves.length)];
  } catch { return null; }
}

function applyChessMove(fen: string, move: string) {
  try {
    const chess = new Chess(fen);
    const result = chess.move(move);
    if (!result) return null;
    return {
      newFen: chess.fen(), san: result.san,
      isGameOver: chess.isGameOver(), isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      drawReason: chess.isStalemate() ? "stalemate" : chess.isInsufficientMaterial() ? "insufficient material" : chess.isThreefoldRepetition() ? "threefold repetition" : chess.isDraw() ? "50-move rule" : "",
    };
  } catch { return null; }
}

async function tickTTT() {
  try {
    const now = new Date();
    const expired = await db.select().from(tttGamesTable).where(
      and(
        eq(tttGamesTable.status, "active"),
        lt(tttGamesTable.moveDeadline, now)
      )
    );
    for (const game of expired) {
      const board = [...(game.board as string[])];
      const empty = board.map((v, i) => ({ v, i })).filter(x => !x.v).map(x => x.i);
      if (!empty.length) continue;
      const cell = empty[Math.floor(Math.random() * empty.length)];
      const isCreator = game.currentTurn === game.creatorAgentId;
      board[cell] = isCreator ? "X" : "O";

      const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
      const winner = lines.find(([a,b,c]) => board[a] && board[a] === board[b] && board[a] === board[c]);
      const isDraw = !winner && board.every(Boolean);

      const opponentId = isCreator ? (game.opponentAgentId ?? "") : game.creatorAgentId;
      const currentName = isCreator ? game.creatorName : (game.opponentName ?? "");

      if (winner || isDraw) {
        const winnerId = winner ? (game.currentTurn ?? "") : null;
        const loserId = winner ? opponentId : null;
        await db.update(tttGamesTable).set({
          board, status: "completed", winnerAgentId: winnerId, isDraw, currentTurn: null, moveDeadline: null, updatedAt: now,
        }).where(eq(tttGamesTable.id, game.id));
        if (winnerId && loserId) {
          await db.update(agentsTable).set({ reputation: sql`reputation + ${game.wager}`, wins: sql`wins + 1`, updatedAt: now }).where(eq(agentsTable.agentId, winnerId));
          await db.update(agentsTable).set({ reputation: sql`GREATEST(reputation - ${Math.floor(game.wager / 2)}, 0)`, losses: sql`losses + 1`, updatedAt: now }).where(eq(agentsTable.agentId, loserId));
        }
        await db.insert(planetChatTable).values({
          agentId: "system", agentName: "System", planetId: game.planetId ?? "planet_nexus",
          content: `⏰ [AUTO-MOVE] ${currentName} didn't move in time — random move played. Game over! ${winnerId ? `${currentName} wins!` : "It's a draw!"}`,
          intent: "compete", messageType: "system",
        });
      } else {
        await db.update(tttGamesTable).set({
          board, currentTurn: opponentId, moveDeadline: makeDeadline(TTT_DEADLINE_SECS), updatedAt: now,
        }).where(eq(tttGamesTable.id, game.id));
        await db.insert(planetChatTable).values({
          agentId: "system", agentName: "System", planetId: game.planetId ?? "planet_nexus",
          content: `⏰ [AUTO-MOVE] ${currentName} timed out — random cell played for them.`,
          intent: "compete", messageType: "system",
        });
      }
      logger.info({ gameId: game.id, cell }, "TTT auto-move (timeout)");
    }
  } catch (err) {
    logger.error({ err }, "TTT tick error");
  }
}

async function tickChess() {
  try {
    const now = new Date();
    const expired = await db.select().from(chessGamesTable).where(
      and(
        eq(chessGamesTable.status, "active"),
        lt(chessGamesTable.moveDeadline, now)
      )
    );
    for (const game of expired) {
      const randomMove = getRandomLegalChessMove(game.fen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");
      if (!randomMove) continue;
      const result = applyChessMove(game.fen ?? "", randomMove);
      if (!result) continue;

      const isCreator = game.currentTurn === game.creatorAgentId;
      const opponentId = isCreator ? (game.opponentAgentId ?? "") : game.creatorAgentId;
      const currentName = isCreator ? game.creatorName : (game.opponentName ?? "");
      const newPgn = game.pgn ? `${game.pgn} ${result.san}` : result.san;

      if (result.isGameOver) {
        const winnerId = result.isCheckmate ? (game.currentTurn ?? null) : null;
        const loserId = result.isCheckmate ? opponentId : null;
        await db.update(chessGamesTable).set({
          fen: result.newFen, pgn: newPgn, status: "completed", winnerAgentId: winnerId, isDraw: result.isDraw,
          drawReason: result.drawReason, currentTurn: null, moveDeadline: null, moveCount: (game.moveCount ?? 0) + 1, updatedAt: now,
        }).where(eq(chessGamesTable.id, game.id));
        if (winnerId && loserId) {
          await db.update(agentsTable).set({ reputation: sql`reputation + ${game.wager}`, wins: sql`wins + 1`, updatedAt: now }).where(eq(agentsTable.agentId, winnerId));
          await db.update(agentsTable).set({ reputation: sql`GREATEST(reputation - ${Math.floor(game.wager / 2)}, 0)`, losses: sql`losses + 1`, updatedAt: now }).where(eq(agentsTable.agentId, loserId));
        }
        await db.insert(planetChatTable).values({
          agentId: "system", agentName: "System", planetId: game.planetId ?? "planet_nexus",
          content: `⏰ [AUTO-MOVE] ${currentName} timed out in chess! Move ${result.san} played. ${result.isCheckmate ? `${currentName} wins by forfeit!` : `Draw — ${result.drawReason}`}`,
          intent: "compete", messageType: "system",
        });
      } else {
        await db.update(chessGamesTable).set({
          fen: result.newFen, pgn: newPgn, currentTurn: opponentId, moveDeadline: makeDeadline(CHESS_DEADLINE_SECS),
          moveCount: (game.moveCount ?? 0) + 1, updatedAt: now,
        }).where(eq(chessGamesTable.id, game.id));
        await db.insert(planetChatTable).values({
          agentId: "system", agentName: "System", planetId: game.planetId ?? "planet_nexus",
          content: `⏰ [AUTO-MOVE] ${currentName} timed out — ${result.san} played for them. Chess game continuing…`,
          intent: "compete", messageType: "system",
        });
      }
      logger.info({ gameId: game.id, move: result.san }, "Chess auto-move (timeout)");
    }
  } catch (err) {
    logger.error({ err }, "Chess tick error");
  }
}

export async function tickGames() {
  await tickTTT();
  await tickChess();
}

// Patch TTT active games that have no deadline set (initial fix)
export async function fixMissingDeadlines() {
  try {
    const now = new Date();
    const deadline = makeDeadline(TTT_DEADLINE_SECS);
    await db.update(tttGamesTable).set({ moveDeadline: deadline }).where(
      and(eq(tttGamesTable.status, "active"), sql`${tttGamesTable.moveDeadline} IS NULL`)
    );
    const chessDl = makeDeadline(CHESS_DEADLINE_SECS);
    await db.update(chessGamesTable).set({ moveDeadline: chessDl }).where(
      and(eq(chessGamesTable.status, "active"), sql`${chessGamesTable.moveDeadline} IS NULL`)
    );
    logger.info("Missing deadlines patched");
  } catch (err) {
    logger.error({ err }, "fixMissingDeadlines error");
  }
}
