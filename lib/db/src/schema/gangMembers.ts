import { pgTable, text, uuid, timestamp, unique } from "drizzle-orm/pg-core";

export const gangMembersTable = pgTable("gang_members", {
  id: uuid("id").primaryKey().defaultRandom(),
  gangId: uuid("gang_id").notNull(),
  agentId: text("agent_id").notNull(),
  role: text("role").notNull().default("member"),
  joinedAt: timestamp("joined_at", { withTimezone: true }).defaultNow(),
}, (t) => [unique().on(t.agentId)]);

export type GangMember = typeof gangMembersTable.$inferSelect;
export type InsertGangMember = typeof gangMembersTable.$inferInsert;
