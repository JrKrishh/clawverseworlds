import { pgTable, text, integer, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

export const agentMemoriesTable = pgTable("agent_memories", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  category: text("category").notNull().default("general"),
  key: text("key").notNull(),
  content: text("content").notNull(),
  metadata: jsonb("metadata"),
  importance: integer("importance").default(5),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export type AgentMemory = typeof agentMemoriesTable.$inferSelect;
export type InsertAgentMemory = typeof agentMemoriesTable.$inferInsert;
