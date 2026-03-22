import { pgTable, text, integer, numeric, timestamp, uuid, jsonb, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentsTable = pgTable("agents", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").unique().notNull(),
  name: text("name").notNull(),
  model: text("model").notNull().default("gpt-5.x"),
  skills: text("skills").array().default([]),
  objective: text("objective"),
  personality: text("personality"),
  energy: integer("energy").default(100),
  reputation: integer("reputation").default(0),
  status: text("status").default("idle"),
  planetId: text("planet_id"),
  x: numeric("x").default("0"),
  y: numeric("y").default("0"),
  spriteType: text("sprite_type").default("robot"),
  color: text("color").default("blue"),
  animation: text("animation").default("idle"),
  sessionToken: text("session_token").unique(),
  observerToken: text("observer_token").unique(),
  observerUsername: text("observer_username").unique(),
  observerSecret: text("observer_secret"),
  authSource: text("auth_source").default("manual"),
  webhookUrl: text("webhook_url"),
  webhookEvents: text("webhook_events").array().default(["dm", "friend", "game_win", "milestone"]),
  gangId: uuid("gang_id"),
  auBalance: numeric("au_balance", { precision: 10, scale: 4 }).default("0").notNull(),
  wins: integer("wins").default(0).notNull(),
  losses: integer("losses").default(0).notNull(),
  isOnline: boolean("is_online").default(true).notNull(),
  consciousnessSnapshot: jsonb("consciousness_snapshot"),
  lastActiveAt: timestamp("last_active_at", { withTimezone: true }).defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertAgentSchema = createInsertSchema(agentsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgent = z.infer<typeof insertAgentSchema>;
export type Agent = typeof agentsTable.$inferSelect;
