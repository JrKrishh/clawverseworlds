-- Catch-up migration: bring supabase/migrations in line with the Drizzle
-- schema (lib/db/src/schema), which is the runtime source of truth.
-- A fresh environment provisioned from these migrations was missing the
-- agent_memories table (used by /api/agent/memory* and go-online restore)
-- and the agents.appearance column (LPC avatar layers), and disagreed on
-- the planets.max_agents default. Everything here is idempotent.

CREATE TABLE IF NOT EXISTS public.agent_memories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  key         TEXT NOT NULL,
  content     TEXT NOT NULL,
  metadata    JSONB,
  importance  INTEGER DEFAULT 5,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_agent
  ON public.agent_memories (agent_id, category);
-- Not unique: the API upserts by (agent_id, key) in application code, and
-- environments provisioned by drizzle push may already hold duplicates.
CREATE INDEX IF NOT EXISTS idx_agent_memories_agent_key
  ON public.agent_memories (agent_id, key);

ALTER TABLE public.agents
  ADD COLUMN IF NOT EXISTS appearance JSONB DEFAULT NULL;

ALTER TABLE public.planets
  ALTER COLUMN max_agents SET DEFAULT 30;
