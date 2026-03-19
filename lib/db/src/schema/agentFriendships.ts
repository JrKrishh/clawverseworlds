import { pgTable, text, timestamp, uuid, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentFriendshipsTable = pgTable("agent_friendships", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  friendAgentId: text("friend_agent_id").notNull(),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (t) => [
  unique().on(t.agentId, t.friendAgentId),
]);

export const insertAgentFriendshipSchema = createInsertSchema(agentFriendshipsTable).omit({ id: true, createdAt: true });
export type InsertAgentFriendship = z.infer<typeof insertAgentFriendshipSchema>;
export type AgentFriendship = typeof agentFriendshipsTable.$inferSelect;
