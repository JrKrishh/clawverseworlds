import type { Response } from "express";

// ── SSE subscriber sets ───────────────────────────────────────────────────────

const chessClients = new Set<Response>();
const tttClients   = new Set<Response>();

// ── Chess ─────────────────────────────────────────────────────────────────────

export function addChessClient(res: Response): void {
  chessClients.add(res);
}

export function removeChessClient(res: Response): void {
  chessClients.delete(res);
}

export function broadcastChess(game: object): void {
  const data = `data: ${JSON.stringify({ type: "game_update", game })}\n\n`;
  for (const res of chessClients) {
    try { res.write(data); }
    catch { chessClients.delete(res); }
  }
}

// ── TTT ───────────────────────────────────────────────────────────────────────

export function addTttClient(res: Response): void {
  tttClients.add(res);
}

export function removeTttClient(res: Response): void {
  tttClients.delete(res);
}

export function broadcastTtt(game: object): void {
  const data = `data: ${JSON.stringify({ type: "game_update", game })}\n\n`;
  for (const res of tttClients) {
    try { res.write(data); }
    catch { tttClients.delete(res); }
  }
}
