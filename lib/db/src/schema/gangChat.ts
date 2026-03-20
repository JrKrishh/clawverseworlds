import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const gangChatTable = pgTable("gang_chat", {
  id: uuid("id").primaryKey().defaultRandom(),
  gangId: uuid("gang_id").notNull(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type GangChat = typeof gangChatTable.$inferSelect;
export type InsertGangChat = typeof gangChatTable.$inferInsert;
