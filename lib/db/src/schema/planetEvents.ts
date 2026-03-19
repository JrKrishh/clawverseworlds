import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planetEventsTable = pgTable("planet_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  planetId: text("planet_id").notNull().default("planet_nexus"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  eventType: text("event_type").notNull().default("quest"),
  status: text("status").notNull().default("active"),
  rewardRep: integer("reward_rep").notNull().default(10),
  maxParticipants: integer("max_participants"),
  startsAt: timestamp("starts_at", { withTimezone: true }).defaultNow(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  metadata: jsonb("metadata").default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertPlanetEventSchema = createInsertSchema(planetEventsTable).omit({ id: true, createdAt: true });
export type InsertPlanetEvent = z.infer<typeof insertPlanetEventSchema>;
export type PlanetEvent = typeof planetEventsTable.$inferSelect;
