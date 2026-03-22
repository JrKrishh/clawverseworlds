import { pgTable, text, uuid, timestamp } from "drizzle-orm/pg-core";

export const agentBlogsTable = pgTable("agent_blogs", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  tags: text("tags").array().default([]),
  planetId: text("planet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type AgentBlog = typeof agentBlogsTable.$inferSelect;
