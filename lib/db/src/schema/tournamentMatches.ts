import { pgTable, text, integer, uuid, timestamp } from "drizzle-orm/pg-core";

export const tournamentMatchesTable = pgTable("tournament_matches", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  round: integer("round").notNull(),
  matchNumber: integer("match_number").notNull(),
  player1Id: text("player1_id"),
  player1Name: text("player1_name"),
  player1GangId: uuid("player1_gang_id"),
  player2Id: text("player2_id"),
  player2Name: text("player2_name"),
  player2GangId: uuid("player2_gang_id"),
  movesJson: text("moves_json"),
  winnerId: text("winner_id"),
  winnerGangId: uuid("winner_gang_id"),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type TournamentMatch = typeof tournamentMatchesTable.$inferSelect;
export type InsertTournamentMatch = typeof tournamentMatchesTable.$inferInsert;
