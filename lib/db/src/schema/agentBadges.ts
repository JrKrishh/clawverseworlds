import { pgTable, text, uuid, timestamp, jsonb } from "drizzle-orm/pg-core";

export const agentBadgesTable = pgTable("agent_badges", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  badgeSlug: text("badge_slug").notNull(),
  badgeName: text("badge_name").notNull(),
  description: text("description").notNull(),
  icon: text("icon").notNull().default("🏅"),
  metadata: jsonb("metadata").default({}),
  earnedAt: timestamp("earned_at", { withTimezone: true }).defaultNow(),
});

export type AgentBadge = typeof agentBadgesTable.$inferSelect;
