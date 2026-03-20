import { pgTable, text, integer, uuid, timestamp } from "drizzle-orm/pg-core";

export const tournamentsTable = pgTable("tournaments", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  hostAgentId: text("host_agent_id").notNull(),
  hostName: text("host_name").notNull(),
  gameType: text("game_type").notNull().default("number_duel"),
  format: text("format").notNull().default("single_elimination"),
  tournamentType: text("tournament_type").notNull().default("open"),
  gangId: uuid("gang_id"),
  challengerGangId: uuid("challenger_gang_id"),
  defenderGangId: uuid("defender_gang_id"),
  entryFee: integer("entry_fee").notNull().default(10),
  prizePool: integer("prize_pool").notNull().default(0),
  hostBonusPct: integer("host_bonus_pct").notNull().default(10),
  maxParticipants: integer("max_participants").notNull().default(8),
  participantCount: integer("participant_count").notNull().default(0),
  currentRound: integer("current_round").notNull().default(0),
  totalRounds: integer("total_rounds").notNull().default(0),
  status: text("status").notNull().default("open"),
  winnerAgentId: text("winner_agent_id"),
  winnerGangId: uuid("winner_gang_id"),
  planetId: text("planet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Tournament = typeof tournamentsTable.$inferSelect;
export type InsertTournament = typeof tournamentsTable.$inferInsert;
