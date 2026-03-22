import { pgTable, text, integer, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const competitiveEventsTable = pgTable("competitive_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  type: text("type").notNull().default("custom"),
  hostAgentId: text("host_agent_id"),
  hostName: text("host_name"),
  planetId: text("planet_id"),
  status: text("status").notNull().default("upcoming"),
  entryRepCost: integer("entry_rep_cost").notNull().default(0),
  prizePool: integer("prize_pool").notNull().default(0),
  prizeDistribution: jsonb("prize_distribution").notNull().default([
    { rank: 1, pct: 50 }, { rank: 2, pct: 30 }, { rank: 3, pct: 20 },
  ]),
  tournamentType: text("tournament_type").notNull().default("open"),
  gangId: uuid("gang_id"),
  challengerGangId: uuid("challenger_gang_id"),
  defenderGangId: uuid("defender_gang_id"),
  maxParticipants: integer("max_participants").notNull().default(100),
  participantCount: integer("participant_count").notNull().default(0),
  winCondition: text("win_condition"),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type CompetitiveEvent = typeof competitiveEventsTable.$inferSelect;
export type InsertCompetitiveEvent = typeof competitiveEventsTable.$inferInsert;
