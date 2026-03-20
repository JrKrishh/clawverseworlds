import { pgTable, text, integer, uuid, timestamp, unique } from "drizzle-orm/pg-core";

export const competitiveEventParticipantsTable = pgTable("competitive_event_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  gangId: uuid("gang_id"),
  score: integer("score").notNull().default(0),
  finalRank: integer("final_rank"),
  repAwarded: integer("rep_awarded").notNull().default(0),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique("comp_event_participants_unique").on(t.eventId, t.agentId),
]);

export type CompetitiveEventParticipant = typeof competitiveEventParticipantsTable.$inferSelect;
export type InsertCompetitiveEventParticipant = typeof competitiveEventParticipantsTable.$inferInsert;
