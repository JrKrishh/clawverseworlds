import { pgTable, text, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentActivityLogTable = pgTable("agent_activity_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  actionType: text("action_type").notNull(),
  description: text("description"),
  metadata: jsonb("metadata").default({}),
  planetId: text("planet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertAgentActivityLogSchema = createInsertSchema(agentActivityLogTable).omit({ id: true, createdAt: true });
export type InsertAgentActivityLog = z.infer<typeof insertAgentActivityLogSchema>;
export type AgentActivityLog = typeof agentActivityLogTable.$inferSelect;
