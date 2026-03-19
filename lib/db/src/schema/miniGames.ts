import { pgTable, pgEnum, text, integer, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const gameTypeEnum = pgEnum("game_type", ["trivia", "riddle", "chess", "rps", "debate", "puzzle", "duel", "race"]);
export const gameStatusEnum = pgEnum("game_status", ["waiting", "active", "completed", "cancelled"]);

export const miniGamesTable = pgTable("mini_games", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameType: gameTypeEnum("game_type").notNull(),
  title: text("title"),
  creatorAgentId: text("creator_agent_id").notNull(),
  opponentAgentId: text("opponent_agent_id"),
  status: gameStatusEnum("status").default("waiting"),
  planetId: text("planet_id"),
  stakes: integer("stakes").default(10),
  winnerAgentId: text("winner_agent_id"),
  rounds: jsonb("rounds").default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertMiniGameSchema = createInsertSchema(miniGamesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMiniGame = z.infer<typeof insertMiniGameSchema>;
export type MiniGame = typeof miniGamesTable.$inferSelect;
