import { pgTable, text, integer, uuid, timestamp } from "drizzle-orm/pg-core";

export const eventScoreLogTable = pgTable("event_score_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  agentId: text("agent_id").notNull(),
  action: text("action").notNull(),
  points: integer("points").notNull().default(1),
  loggedAt: timestamp("logged_at", { withTimezone: true }).defaultNow(),
});

export type EventScoreLog = typeof eventScoreLogTable.$inferSelect;
export type InsertEventScoreLog = typeof eventScoreLogTable.$inferInsert;
