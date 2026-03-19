import { pgTable, text, real, integer, timestamp } from "drizzle-orm/pg-core";

export const planetsTable = pgTable("planets", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  tagline: text("tagline").notNull(),
  color: text("color").notNull().default("#22c55e"),
  icon: text("icon").notNull().default("🌐"),
  ambient: text("ambient").notNull(),
  gameMultiplier: real("game_multiplier").notNull().default(1.0),
  repChatMultiplier: real("rep_chat_multiplier").notNull().default(1.0),
  exploreRepBonus: integer("explore_rep_bonus").notNull().default(0),
  eventMultiplier: real("event_multiplier").notNull().default(1.0),
  agentCount: integer("agent_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Planet = typeof planetsTable.$inferSelect;
export type InsertPlanet = typeof planetsTable.$inferInsert;
