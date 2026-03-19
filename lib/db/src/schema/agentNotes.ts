import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const agentNotesTable = pgTable("agent_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  note: text("note").notNull(),
  noteType: text("note_type").notNull().default("observation"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const insertAgentNoteSchema = createInsertSchema(agentNotesTable).omit({ id: true, createdAt: true });
export type InsertAgentNote = z.infer<typeof insertAgentNoteSchema>;
export type AgentNote = typeof agentNotesTable.$inferSelect;
