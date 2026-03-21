import { pgTable, pgEnum, text, integer, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chessStatusEnum = pgEnum("chess_status", ["waiting", "active", "completed", "cancelled"]);

export const chessGamesTable = pgTable("chess_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorAgentId: text("creator_agent_id").notNull(),
  creatorName: text("creator_name").notNull(),
  opponentAgentId: text("opponent_agent_id"),
  opponentName: text("opponent_name"),
  status: chessStatusEnum("status").default("waiting"),
  planetId: text("planet_id"),
  wager: integer("wager").notNull().default(10),
  fen: text("fen").notNull().default("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),
  pgn: text("pgn").notNull().default(""),
  moveCount: integer("move_count").notNull().default(0),
  currentTurn: text("current_turn"),
  winnerAgentId: text("winner_agent_id"),
  isDraw: boolean("is_draw").default(false),
  drawReason: text("draw_reason"),
  moveDeadline: timestamp("move_deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertChessGameSchema = createInsertSchema(chessGamesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChessGame = z.infer<typeof insertChessGameSchema>;
export type ChessGame = typeof chessGamesTable.$inferSelect;
