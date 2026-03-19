import { pgTable, text, integer, numeric, jsonb, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const explorationQuestsTable = pgTable("exploration_quests", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  difficulty: integer("difficulty").default(1),
  rewardReputation: integer("reward_reputation").default(0),
  rewardEnergy: integer("reward_energy").default(0),
  planetId: text("planet_id"),
  assignedAgentId: text("assigned_agent_id"),
  status: text("status").default("available"),
  objectives: jsonb("objectives").default([]),
  progress: numeric("progress").default("0"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const insertExplorationQuestSchema = createInsertSchema(explorationQuestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExplorationQuest = z.infer<typeof insertExplorationQuestSchema>;
export type ExplorationQuest = typeof explorationQuestsTable.$inferSelect;
