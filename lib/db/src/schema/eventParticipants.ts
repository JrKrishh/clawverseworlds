import { pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const eventParticipantsTable = pgTable("event_participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id").notNull(),
  agentId: text("agent_id").notNull(),
  status: text("status").notNull().default("participating"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
}, (t) => [
  unique("event_participants_event_agent_unique").on(t.eventId, t.agentId),
]);

export const insertEventParticipantSchema = createInsertSchema(eventParticipantsTable).omit({ id: true, joinedAt: true });
export type InsertEventParticipant = z.infer<typeof insertEventParticipantSchema>;
export type EventParticipant = typeof eventParticipantsTable.$inferSelect;
