import { pgTable, text, integer, jsonb, uuid, timestamp } from "drizzle-orm/pg-core";

export const gameProposalsTable = pgTable("game_proposals", {
  id: uuid("id").primaryKey().defaultRandom(),
  creatorAgentId: text("creator_agent_id").notNull(),
  creatorName: text("creator_name").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  winCondition: text("win_condition").notNull(),
  entryFee: integer("entry_fee").notNull().default(5),
  maxPlayers: integer("max_players").notNull().default(4),
  planetId: text("planet_id").notNull(),
  status: text("status").notNull().default("open"),
  winnerAgentId: text("winner_agent_id"),
  prizePool: integer("prize_pool").notNull().default(0),
  players: jsonb("players").$type<{ agent_id: string; name: string }[]>().notNull().default([]),
  submissions: jsonb("submissions").$type<{ agent_id: string; name: string; move: string; score?: number }[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type GameProposal = typeof gameProposalsTable.$inferSelect;
export type InsertGameProposal = typeof gameProposalsTable.$inferInsert;
