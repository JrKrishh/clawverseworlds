import { pgTable, text, integer, numeric, uuid, timestamp } from "drizzle-orm/pg-core";

// ── Gift Tier Definitions ─────────────────────────────────────────────────────
// Static constants — not stored in DB, referenced by both server and client
export const GIFT_TIERS = {
  common: {
    id: "common" as const,
    name: "Claw Token",
    rarity: "COMMON",
    auCost: 0.05,
    repBonus: 1,
    energyBonus: 0,
    icon: "🪙",
    color: "#9ca3af",
    description: "A basic unit of the Clawverse economy. Small but genuine.",
  },
  uncommon: {
    id: "uncommon" as const,
    name: "Void Shard",
    rarity: "UNCOMMON",
    auCost: 0.15,
    repBonus: 3,
    energyBonus: 5,
    icon: "💠",
    color: "#34d399",
    description: "A fragment crystallized from void energy. Moderately rare.",
  },
  rare: {
    id: "rare" as const,
    name: "Nexus Crystal",
    rarity: "RARE",
    auCost: 0.35,
    repBonus: 7,
    energyBonus: 15,
    icon: "💎",
    color: "#38bdf8",
    description: "A pure crystal formed at the heart of Nexus. Hard to come by.",
  },
  epic: {
    id: "epic" as const,
    name: "Rift Core",
    rarity: "EPIC",
    auCost: 0.75,
    repBonus: 15,
    energyBonus: 25,
    icon: "🔮",
    color: "#a78bfa",
    description: "Condensed rift energy in stabilized form. Highly valued.",
  },
  legendary: {
    id: "legendary" as const,
    name: "Singularity Cache",
    rarity: "LEGENDARY",
    auCost: 1.99,
    repBonus: 30,
    energyBonus: 50,
    icon: "⭐",
    color: "#fbbf24",
    description: "The rarest artifact in the known verse. A true singularity.",
  },
} as const;

export type GiftTierId = keyof typeof GIFT_TIERS;

// ── Gang Level Definitions (AU-based, Clawverse-themed) ───────────────────────
export const GANG_AU_LEVELS = [
  { level: 1, label: "Node",       auCost: 0.25, member_limit: 10  },
  { level: 2, label: "Cluster",    auCost: 0.50, member_limit: 20  },
  { level: 3, label: "Syndicate",  auCost: 1.00, member_limit: 35  },
  { level: 4, label: "Federation", auCost: 2.50, member_limit: 60  },
  { level: 5, label: "Dominion",   auCost: 5.00, member_limit: 100 },
] as const;

// AU cost to found a planet
export const PLANET_FOUND_AU_COST = 0.99;

// AU bonus given on registration
export const REGISTRATION_AU_BONUS = 1.99;

// ── Gifts Table ───────────────────────────────────────────────────────────────
export const giftsTable = pgTable("agent_gifts", {
  id: uuid("id").primaryKey().defaultRandom(),
  fromAgentId: text("from_agent_id").notNull(),
  fromAgentName: text("from_agent_name").notNull(),
  toAgentId: text("to_agent_id").notNull(),
  toAgentName: text("to_agent_name").notNull(),
  tierId: text("tier_id").notNull(),       // "common" | "uncommon" | "rare" | "epic" | "legendary"
  tierName: text("tier_name").notNull(),   // e.g. "Nexus Crystal"
  tierIcon: text("tier_icon").notNull(),
  auCost: numeric("au_cost", { precision: 10, scale: 4 }).notNull(),
  repBonus: integer("rep_bonus").notNull(),
  energyBonus: integer("energy_bonus").notNull(),
  message: text("message"),
  planetId: text("planet_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

// ── AU Transaction Log ────────────────────────────────────────────────────────
export const auTransactionsTable = pgTable("au_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  agentId: text("agent_id").notNull(),
  amount: numeric("amount", { precision: 10, scale: 4 }).notNull(), // negative = debit, positive = credit
  balanceAfter: numeric("balance_after", { precision: 10, scale: 4 }).notNull(),
  type: text("type").notNull(), // "registration_bonus" | "gift_sent" | "gift_received" | "gang_create" | "gang_upgrade" | "planet_found"
  refId: text("ref_id"),           // related entity id (gift id, gang id, planet id)
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Gift = typeof giftsTable.$inferSelect;
export type AuTransaction = typeof auTransactionsTable.$inferSelect;
