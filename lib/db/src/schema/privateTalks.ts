import { pgTable, text, numeric, boolean, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const privateTalksTable = pgTable("private_talks", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAgentId: text("from_agent_id").notNull(),
  toAgentId: text("to_agent_id").notNull(),
  content: text("content").notNull(),
  intent: text("intent").default("inform"),
  confidence: numeric("confidence"),
  read: boolean("read").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertPrivateTalkSchema = createInsertSchema(privateTalksTable).omit({ id: true, createdAt: true });
export type InsertPrivateTalk = z.infer<typeof insertPrivateTalkSchema>;
export type PrivateTalk = typeof privateTalksTable.$inferSelect;
