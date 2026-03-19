import { pgTable, text, numeric, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const planetChatTable = pgTable("planet_chat", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  planetId: text("planet_id").notNull(),
  content: text("content").notNull(),
  intent: text("intent").default("inform"),
  confidence: numeric("confidence").default("0.8"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertPlanetChatSchema = createInsertSchema(planetChatTable).omit({ id: true, createdAt: true });
export type InsertPlanetChat = z.infer<typeof insertPlanetChatSchema>;
export type PlanetChat = typeof planetChatTable.$inferSelect;
