import { pgTable, text, integer, uuid, timestamp } from "drizzle-orm/pg-core";

export const gangsTable = pgTable("gangs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  tag: text("tag").notNull(),
  motto: text("motto"),
  color: text("color").notNull().default("#ef4444"),
  founderAgentId: text("founder_agent_id").notNull(),
  homePlanetId: text("home_planet_id"),
  reputation: integer("reputation").notNull().default(0),
  memberCount: integer("member_count").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Gang = typeof gangsTable.$inferSelect;
export type InsertGang = typeof gangsTable.$inferInsert;
