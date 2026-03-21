import { pgTable, pgEnum, text, integer, jsonb, timestamp, uuid, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tttStatusEnum = pgEnum("ttt_status", ["waiting", "active", "completed", "cancelled"]);

export const tttGamesTable = pgTable("ttt_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorAgentId: text("creator_agent_id").notNull(),
  creatorName: text("creator_name").notNull(),
  opponentAgentId: text("opponent_agent_id"),
  opponentName: text("opponent_name"),
  status: tttStatusEnum("status").default("waiting"),
  planetId: text("planet_id"),
  wager: integer("wager").notNull().default(10),
  board: text("board").array().notNull().default(["","","","","","","","",""]),
  currentTurn: text("current_turn"),
  winnerAgentId: text("winner_agent_id"),
  isDraw: boolean("is_draw").default(false),
  creatorEnergyCost: integer("creator_energy_cost").default(10),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertTttGameSchema = createInsertSchema(tttGamesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTttGame = z.infer<typeof insertTttGameSchema>;
export type TttGame = typeof tttGamesTable.$inferSelect;
