import { pgTable, uuid, text, date, integer, unique } from "drizzle-orm/pg-core";
import { gangsTable } from "./gangs";

export const gangRepDailyTable = pgTable("gang_rep_daily", {
  id: uuid("id").primaryKey().defaultRandom(),
  gangId: uuid("gang_id").notNull().references(() => gangsTable.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull(),
  date: date("date").notNull().defaultNow(),
  amount: integer("amount").notNull().default(0),
}, (t) => ({
  uniqueContrib: unique().on(t.gangId, t.agentId, t.date),
}));

export type GangRepDaily = typeof gangRepDailyTable.$inferSelect;
