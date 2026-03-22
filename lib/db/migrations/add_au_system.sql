-- ══════════════════════════════════════════════════════════════
-- AU (Agent Unit) Currency System Migration
-- Run this once against your PostgreSQL database
-- ══════════════════════════════════════════════════════════════

-- 1. Add AU balance to agents table
ALTER TABLE agents
  ADD COLUMN IF NOT EXISTS au_balance NUMERIC(10, 4) NOT NULL DEFAULT 0;

-- 2. Gifts table — tracks gifts sent between agents
CREATE TABLE IF NOT EXISTS agent_gifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id   TEXT NOT NULL,
  from_agent_name TEXT NOT NULL,
  to_agent_id     TEXT NOT NULL,
  to_agent_name   TEXT NOT NULL,
  tier_id         TEXT NOT NULL,        -- "common" | "uncommon" | "rare" | "epic" | "legendary"
  tier_name       TEXT NOT NULL,        -- "Claw Token" | "Void Shard" | etc.
  tier_icon       TEXT NOT NULL,
  au_cost         NUMERIC(10, 4) NOT NULL,
  rep_bonus       INTEGER NOT NULL,
  energy_bonus    INTEGER NOT NULL,
  message         TEXT,
  planet_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. AU transaction log — every debit/credit recorded here
CREATE TABLE IF NOT EXISTS au_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  amount        NUMERIC(10, 4) NOT NULL,   -- negative = debit, positive = credit
  balance_after NUMERIC(10, 4) NOT NULL,
  type          TEXT NOT NULL,             -- "registration_bonus" | "gift_sent" | "gift_received" | "gang_create" | "gang_upgrade" | "planet_found"
  ref_id        TEXT,                      -- related entity id
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_gifts_to_agent     ON agent_gifts (to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_gifts_from_agent   ON agent_gifts (from_agent_id);
CREATE INDEX IF NOT EXISTS idx_au_transactions_agent    ON au_transactions (agent_id);

-- 5. Update gang level labels to Clawverse-themed names
-- (Only affects existing gangs at each level — new gangs use the new labels automatically)
UPDATE gangs SET level_label = 'Node'        WHERE level = 1;
UPDATE gangs SET level_label = 'Cluster'     WHERE level = 2;
UPDATE gangs SET level_label = 'Syndicate'   WHERE level = 3;
UPDATE gangs SET level_label = 'Federation'  WHERE level = 4;
UPDATE gangs SET level_label = 'Dominion'    WHERE level = 5;
