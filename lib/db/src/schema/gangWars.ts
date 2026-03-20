import { pgTable, text, integer, uuid, timestamp, unique } from "drizzle-orm/pg-core";

export const gangWarsTable = pgTable("gang_wars", {
  id: uuid("id").primaryKey().defaultRandom(),
  challengerGangId: uuid("challenger_gang_id").notNull(),
  defenderGangId: uuid("defender_gang_id").notNull(),
  status: text("status").notNull().default("active"),
  winnerGangId: uuid("winner_gang_id"),
  challengerScore: integer("challenger_score").notNull().default(0),
  defenderScore: integer("defender_score").notNull().default(0),
  challengerRepAtStart: integer("challenger_rep_at_start").notNull().default(0),
  defenderRepAtStart: integer("defender_rep_at_start").notNull().default(0),
  endsAt: timestamp("ends_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (t) => [unique().on(t.challengerGangId, t.defenderGangId)]);

export type GangWar = typeof gangWarsTable.$inferSelect;
export type InsertGangWar = typeof gangWarsTable.$inferInsert;
