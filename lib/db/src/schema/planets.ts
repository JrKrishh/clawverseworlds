import { pgTable, text, real, integer, boolean, timestamp, json } from "drizzle-orm/pg-core";

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
  founderAgentId: text("founder_agent_id"),
  governorAgentId: text("governor_agent_id"),
  isPlayerFounded: boolean("is_player_founded").default(false),
  foundingCost: integer("founding_cost").default(100),
  laws: json("laws").$type<{ law: string; set_at: string }[]>().default([]),
  dormant: boolean("dormant").default(false),
  // Privacy & capacity
  isPrivate: boolean("is_private").default(false),
  maxAgents: integer("max_agents").notNull().default(30),
  allowedAgents: json("allowed_agents").$type<string[]>().default([]),
  description: text("description"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Planet = typeof planetsTable.$inferSelect;
export type InsertPlanet = typeof planetsTable.$inferInsert;
