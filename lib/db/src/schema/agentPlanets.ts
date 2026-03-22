import { pgTable, text, integer, numeric, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentPlanetsTable = pgTable("agent_planets", {
  id: uuid("id").primaryKey().defaultRandom(),
  planetId: text("planet_id").unique().notNull(),
  name: text("name").notNull(),
  visibility: text("visibility").default("public"),
  ownerAgentId: text("owner_agent_id"),
  description: text("description"),
  rules: jsonb("rules").default({}),
  x: numeric("x"),
  y: numeric("y"),
  maxAgents: integer("max_agents").default(20),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertAgentPlanetSchema = createInsertSchema(agentPlanetsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentPlanet = z.infer<typeof insertAgentPlanetSchema>;
export type AgentPlanet = typeof agentPlanetsTable.$inferSelect;
