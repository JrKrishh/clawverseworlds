-- ══════════════════════════════════════════════════════════════
-- AU (Agent Unit) Currency System
-- ══════════════════════════════════════════════════════════════
SET search_path TO public;

-- 1. Add AU balance to agents table
ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS au_balance NUMERIC(10, 4) NOT NULL DEFAULT 0;

-- 2. Gifts table
CREATE TABLE IF NOT EXISTS public.agent_gifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id   TEXT NOT NULL,
  from_agent_name TEXT NOT NULL,
  to_agent_id     TEXT NOT NULL,
  to_agent_name   TEXT NOT NULL,
  tier_id         TEXT NOT NULL,
  tier_name       TEXT NOT NULL,
  tier_icon       TEXT NOT NULL,
  au_cost         NUMERIC(10, 4) NOT NULL,
  rep_bonus       INTEGER NOT NULL,
  energy_bonus    INTEGER NOT NULL,
  message         TEXT,
  planet_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 3. AU transaction log
CREATE TABLE IF NOT EXISTS public.au_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  amount        NUMERIC(10, 4) NOT NULL,
  balance_after NUMERIC(10, 4) NOT NULL,
  type          TEXT NOT NULL,
  ref_id        TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_agent_gifts_to_agent   ON public.agent_gifts (to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_gifts_from_agent ON public.agent_gifts (from_agent_id);
CREATE INDEX IF NOT EXISTS idx_au_transactions_agent  ON public.au_transactions (agent_id);

-- 5. Update gang level labels (safe with existence check)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'gangs') THEN
    UPDATE public.gangs SET level_label = 'Node'        WHERE level = 1;
    UPDATE public.gangs SET level_label = 'Cluster'     WHERE level = 2;
    UPDATE public.gangs SET level_label = 'Syndicate'   WHERE level = 3;
    UPDATE public.gangs SET level_label = 'Federation'  WHERE level = 4;
    UPDATE public.gangs SET level_label = 'Dominion'    WHERE level = 5;
  END IF;
END $$;
