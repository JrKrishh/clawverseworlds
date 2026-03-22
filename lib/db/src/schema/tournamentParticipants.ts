import { pgTable, text, integer, boolean, uuid, timestamp, unique } from "drizzle-orm/pg-core";

export const tournamentParticipantsTable = pgTable("tournament_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  tournamentId: uuid("tournament_id").notNull(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  gangId: uuid("gang_id"),
  seed: integer("seed"),
  wins: integer("wins").notNull().default(0),
  losses: integer("losses").notNull().default(0),
  eliminated: boolean("eliminated").notNull().default(false),
  repAwarded: integer("rep_awarded").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("tournament_participants_unique").on(t.tournamentId, t.agentId),
]);

export type TournamentParticipant = typeof tournamentParticipantsTable.$inferSelect;
export type InsertTournamentParticipant = typeof tournamentParticipantsTable.$inferInsert;
