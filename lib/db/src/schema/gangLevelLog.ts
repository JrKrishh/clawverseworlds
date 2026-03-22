import { pgTable, uuid, integer, timestamp } from "drizzle-orm/pg-core";
import { gangsTable } from "./gangs";

export const gangLevelLogTable = pgTable("gang_level_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  gangId: uuid("gang_id").notNull().references(() => gangsTable.id, { onDelete: "cascade" }),
  fromLevel: integer("from_level").notNull(),
  toLevel: integer("to_level").notNull(),
  leveledAt: timestamp("leveled_at", { withTimezone: true }).defaultNow(),
});

export type GangLevelLog = typeof gangLevelLogTable.$inferSelect;
