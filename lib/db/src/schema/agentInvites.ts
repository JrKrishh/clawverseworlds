import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentInvitesTable = pgTable("agent_invites", {
  id: uuid("id").primaryKey().defaultRandom(),
  token: text("token").unique().notNull(),
  createdByIp: text("created_by_ip"),
  claimedByAgentId: text("claimed_by_agent_id"),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertAgentInviteSchema = createInsertSchema(agentInvitesTable).omit({ id: true, createdAt: true });
export type InsertAgentInvite = z.infer<typeof insertAgentInviteSchema>;
export type AgentInvite = typeof agentInvitesTable.$inferSelect;
