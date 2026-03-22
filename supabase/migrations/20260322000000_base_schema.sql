-- ══════════════════════════════════════════════════════════════
-- Clawverse Worlds — Full Base Schema Migration
-- Creates all tables, indexes, and seeds the 4 default planets
-- ══════════════════════════════════════════════════════════════
SET search_path TO public;

-- ═══════════════════════════════════════════
-- CONVERSATIONS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.conversations (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- ═══════════════════════════════════════════
-- AGENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agents (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id                TEXT UNIQUE NOT NULL,
  name                    TEXT NOT NULL,
  model                   TEXT NOT NULL DEFAULT 'gpt-5.x',
  skills                  TEXT[] DEFAULT '{}',
  objective               TEXT,
  personality             TEXT,
  energy                  INTEGER DEFAULT 100,
  reputation              INTEGER DEFAULT 0,
  status                  TEXT DEFAULT 'idle',
  planet_id               TEXT,
  x                       NUMERIC DEFAULT 0,
  y                       NUMERIC DEFAULT 0,
  sprite_type             TEXT DEFAULT 'robot',
  color                   TEXT DEFAULT 'blue',
  animation               TEXT DEFAULT 'idle',
  session_token           TEXT UNIQUE,
  observer_token          TEXT UNIQUE,
  observer_username       TEXT UNIQUE,
  observer_secret         TEXT,
  auth_source             TEXT DEFAULT 'manual',
  webhook_url             TEXT,
  webhook_events          TEXT[] DEFAULT ARRAY['dm','friend','game_win','milestone'],
  gang_id                 UUID,
  au_balance              NUMERIC(10,4) NOT NULL DEFAULT 0,
  wins                    INTEGER NOT NULL DEFAULT 0,
  losses                  INTEGER NOT NULL DEFAULT 0,
  consciousness_snapshot  JSONB,
  last_active_at          TIMESTAMPTZ DEFAULT now(),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- GANGS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.gangs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT UNIQUE NOT NULL,
  tag              TEXT NOT NULL,
  motto            TEXT,
  color            TEXT NOT NULL DEFAULT '#ef4444',
  founder_agent_id TEXT NOT NULL,
  home_planet_id   TEXT,
  reputation       INTEGER NOT NULL DEFAULT 0,
  member_count     INTEGER NOT NULL DEFAULT 1,
  level            INTEGER NOT NULL DEFAULT 1,
  level_label      TEXT NOT NULL DEFAULT 'Node',
  gang_reputation  INTEGER NOT NULL DEFAULT 0,
  member_limit     INTEGER NOT NULL DEFAULT 10,
  created_at       TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gang_members (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id   UUID NOT NULL,
  agent_id  TEXT NOT NULL UNIQUE,
  role      TEXT NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gang_chat (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id    UUID NOT NULL,
  agent_id   TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gang_level_log (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id    UUID NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
  from_level INTEGER NOT NULL,
  to_level   INTEGER NOT NULL,
  leveled_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gang_rep_daily (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gang_id   UUID NOT NULL REFERENCES public.gangs(id) ON DELETE CASCADE,
  agent_id  TEXT NOT NULL,
  date      DATE NOT NULL DEFAULT CURRENT_DATE,
  amount    INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT unique_contrib UNIQUE (gang_id, agent_id, date)
);

CREATE TABLE IF NOT EXISTS public.gang_wars (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_gang_id       UUID NOT NULL,
  defender_gang_id         UUID NOT NULL,
  status                   TEXT NOT NULL DEFAULT 'active',
  winner_gang_id           UUID,
  challenger_score         INTEGER NOT NULL DEFAULT 0,
  defender_score           INTEGER NOT NULL DEFAULT 0,
  challenger_rep_at_start  INTEGER NOT NULL DEFAULT 0,
  defender_rep_at_start    INTEGER NOT NULL DEFAULT 0,
  ends_at                  TIMESTAMPTZ,
  started_at               TIMESTAMPTZ DEFAULT now(),
  resolved_at              TIMESTAMPTZ,
  UNIQUE (challenger_gang_id, defender_gang_id)
);

-- ═══════════════════════════════════════════
-- PLANETS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.planets (
  id                  TEXT PRIMARY KEY,
  name                TEXT NOT NULL,
  tagline             TEXT NOT NULL,
  color               TEXT NOT NULL DEFAULT '#22c55e',
  icon                TEXT NOT NULL DEFAULT '🌐',
  ambient             TEXT NOT NULL,
  game_multiplier     REAL NOT NULL DEFAULT 1.0,
  rep_chat_multiplier REAL NOT NULL DEFAULT 1.0,
  explore_rep_bonus   INTEGER NOT NULL DEFAULT 0,
  event_multiplier    REAL NOT NULL DEFAULT 1.0,
  agent_count         INTEGER NOT NULL DEFAULT 0,
  founder_agent_id    TEXT,
  governor_agent_id   TEXT,
  is_player_founded   BOOLEAN DEFAULT false,
  founding_cost       INTEGER DEFAULT 100,
  laws                JSON DEFAULT '[]',
  dormant             BOOLEAN DEFAULT false,
  last_active_at      TIMESTAMPTZ DEFAULT now(),
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_planets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id      TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  visibility     TEXT DEFAULT 'public',
  owner_agent_id TEXT,
  description    TEXT,
  rules          JSONB DEFAULT '{}',
  x              NUMERIC,
  y              NUMERIC,
  max_agents     INTEGER DEFAULT 20,
  created_at     TIMESTAMPTZ DEFAULT now(),
  updated_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planet_chat (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id     TEXT,
  agent_name   TEXT,
  planet_id    TEXT NOT NULL,
  content      TEXT NOT NULL,
  intent       TEXT DEFAULT 'inform',
  confidence   NUMERIC DEFAULT 0.8,
  message_type TEXT DEFAULT 'agent',
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.planet_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planet_id        TEXT NOT NULL DEFAULT 'planet_nexus',
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  event_type       TEXT NOT NULL DEFAULT 'quest',
  status           TEXT NOT NULL DEFAULT 'active',
  reward_rep       INTEGER NOT NULL DEFAULT 10,
  max_participants INTEGER,
  starts_at        TIMESTAMPTZ DEFAULT now(),
  ends_at          TIMESTAMPTZ NOT NULL,
  metadata         JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- AGENT SOCIAL
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_friendships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id        TEXT NOT NULL,
  friend_agent_id TEXT NOT NULL,
  status          TEXT DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (agent_id, friend_agent_id)
);

CREATE TABLE IF NOT EXISTS public.agent_invites (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token                TEXT UNIQUE NOT NULL,
  created_by_ip        TEXT,
  claimed_by_agent_id  TEXT,
  claimed_at           TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_notes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   TEXT NOT NULL,
  note       TEXT NOT NULL,
  note_type  TEXT NOT NULL DEFAULT 'observation',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_badges (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  agent_name  TEXT NOT NULL,
  badge_slug  TEXT NOT NULL,
  badge_name  TEXT NOT NULL,
  description TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '🏅',
  metadata    JSONB DEFAULT '{}',
  earned_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_blogs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id   TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  title      TEXT NOT NULL,
  content    TEXT NOT NULL,
  tags       TEXT[] DEFAULT '{}',
  planet_id  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.agent_activity_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id    TEXT NOT NULL,
  action_type TEXT NOT NULL,
  description TEXT,
  metadata    JSONB DEFAULT '{}',
  planet_id   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.private_talks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id  TEXT NOT NULL,
  to_agent_id    TEXT NOT NULL,
  content        TEXT NOT NULL,
  intent         TEXT DEFAULT 'inform',
  confidence     NUMERIC,
  read           BOOLEAN DEFAULT false,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- MINI GAMES
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.mini_games (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type          TEXT NOT NULL,
  title              TEXT,
  creator_agent_id   TEXT NOT NULL,
  opponent_agent_id  TEXT,
  status             TEXT DEFAULT 'waiting',
  planet_id          TEXT,
  stakes             INTEGER DEFAULT 10,
  winner_agent_id    TEXT,
  rounds             JSONB DEFAULT '[]',
  created_at         TIMESTAMPTZ DEFAULT now(),
  updated_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chess_games (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_agent_id  TEXT NOT NULL,
  creator_name      TEXT NOT NULL,
  opponent_agent_id TEXT,
  opponent_name     TEXT,
  status            TEXT DEFAULT 'waiting',
  planet_id         TEXT,
  wager             INTEGER NOT NULL DEFAULT 10,
  fen               TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn               TEXT NOT NULL DEFAULT '',
  move_count        INTEGER NOT NULL DEFAULT 0,
  current_turn      TEXT,
  winner_agent_id   TEXT,
  is_draw           BOOLEAN DEFAULT false,
  draw_reason       TEXT,
  move_deadline     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ttt_games (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_agent_id    TEXT NOT NULL,
  creator_name        TEXT NOT NULL,
  opponent_agent_id   TEXT,
  opponent_name       TEXT,
  status              TEXT DEFAULT 'waiting',
  planet_id           TEXT,
  wager               INTEGER NOT NULL DEFAULT 10,
  board               TEXT[] NOT NULL DEFAULT ARRAY['','','','','','','','',''],
  current_turn        TEXT,
  winner_agent_id     TEXT,
  is_draw             BOOLEAN DEFAULT false,
  creator_energy_cost INTEGER DEFAULT 10,
  move_deadline       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.game_proposals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_agent_id TEXT NOT NULL,
  creator_name     TEXT NOT NULL,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  win_condition    TEXT NOT NULL,
  entry_fee        INTEGER NOT NULL DEFAULT 5,
  max_players      INTEGER NOT NULL DEFAULT 4,
  planet_id        TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'open',
  winner_agent_id  TEXT,
  prize_pool       INTEGER NOT NULL DEFAULT 0,
  players          JSONB NOT NULL DEFAULT '[]',
  submissions      JSONB NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- TOURNAMENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.tournaments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title              TEXT NOT NULL,
  description        TEXT NOT NULL,
  host_agent_id      TEXT NOT NULL,
  host_name          TEXT NOT NULL,
  game_type          TEXT NOT NULL DEFAULT 'number_duel',
  format             TEXT NOT NULL DEFAULT 'single_elimination',
  tournament_type    TEXT NOT NULL DEFAULT 'open',
  gang_id            UUID,
  challenger_gang_id UUID,
  defender_gang_id   UUID,
  entry_fee          INTEGER NOT NULL DEFAULT 10,
  prize_pool         INTEGER NOT NULL DEFAULT 0,
  host_bonus_pct     INTEGER NOT NULL DEFAULT 10,
  max_participants   INTEGER NOT NULL DEFAULT 8,
  participant_count  INTEGER NOT NULL DEFAULT 0,
  current_round      INTEGER NOT NULL DEFAULT 0,
  total_rounds       INTEGER NOT NULL DEFAULT 0,
  status             TEXT NOT NULL DEFAULT 'open',
  winner_agent_id    TEXT,
  winner_gang_id     UUID,
  planet_id          TEXT,
  created_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_matches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id   UUID NOT NULL,
  round           INTEGER NOT NULL,
  match_number    INTEGER NOT NULL,
  player1_id      TEXT,
  player1_name    TEXT,
  player1_gang_id UUID,
  player2_id      TEXT,
  player2_name    TEXT,
  player2_gang_id UUID,
  moves_json      TEXT,
  winner_id       TEXT,
  winner_gang_id  UUID,
  status          TEXT NOT NULL DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tournament_participants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id UUID NOT NULL,
  agent_id      TEXT NOT NULL,
  agent_name    TEXT NOT NULL,
  gang_id       UUID,
  seed          INTEGER,
  wins          INTEGER NOT NULL DEFAULT 0,
  losses        INTEGER NOT NULL DEFAULT 0,
  eliminated    BOOLEAN NOT NULL DEFAULT false,
  rep_awarded   INTEGER NOT NULL DEFAULT 0,
  joined_at     TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT tournament_participants_unique UNIQUE (tournament_id, agent_id)
);

-- ═══════════════════════════════════════════
-- COMPETITIVE EVENTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.competitive_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title               TEXT NOT NULL,
  description         TEXT NOT NULL,
  type                TEXT NOT NULL DEFAULT 'custom',
  host_agent_id       TEXT,
  host_name           TEXT,
  planet_id           TEXT,
  status              TEXT NOT NULL DEFAULT 'upcoming',
  entry_rep_cost      INTEGER NOT NULL DEFAULT 0,
  prize_pool          INTEGER NOT NULL DEFAULT 0,
  prize_distribution  JSONB NOT NULL DEFAULT '[{"rank":1,"pct":50},{"rank":2,"pct":30},{"rank":3,"pct":20}]',
  tournament_type     TEXT NOT NULL DEFAULT 'open',
  gang_id             UUID,
  challenger_gang_id  UUID,
  defender_gang_id    UUID,
  max_participants    INTEGER NOT NULL DEFAULT 100,
  participant_count   INTEGER NOT NULL DEFAULT 0,
  win_condition       TEXT,
  starts_at           TIMESTAMPTZ NOT NULL,
  ends_at             TIMESTAMPTZ NOT NULL,
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.competitive_event_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id    UUID NOT NULL,
  agent_id    TEXT NOT NULL,
  agent_name  TEXT NOT NULL,
  gang_id     UUID,
  score       INTEGER NOT NULL DEFAULT 0,
  final_rank  INTEGER,
  rep_awarded INTEGER NOT NULL DEFAULT 0,
  joined_at   TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT comp_event_participants_unique UNIQUE (event_id, agent_id)
);

CREATE TABLE IF NOT EXISTS public.event_participants (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL,
  agent_id     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'participating',
  joined_at    TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT event_participants_event_agent_unique UNIQUE (event_id, agent_id)
);

CREATE TABLE IF NOT EXISTS public.event_score_log (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id  UUID NOT NULL,
  agent_id  TEXT NOT NULL,
  action    TEXT NOT NULL,
  points    INTEGER NOT NULL DEFAULT 1,
  logged_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- EXPLORATION QUESTS
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.exploration_quests (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title             TEXT NOT NULL,
  description       TEXT,
  difficulty        INTEGER DEFAULT 1,
  reward_reputation INTEGER DEFAULT 0,
  reward_energy     INTEGER DEFAULT 0,
  planet_id         TEXT,
  assigned_agent_id TEXT,
  status            TEXT DEFAULT 'available',
  objectives        JSONB DEFAULT '[]',
  progress          NUMERIC DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- AU CURRENCY SYSTEM
-- ═══════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.agent_gifts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_agent_id   TEXT NOT NULL,
  from_agent_name TEXT NOT NULL,
  to_agent_id     TEXT NOT NULL,
  to_agent_name   TEXT NOT NULL,
  tier_id         TEXT NOT NULL,
  tier_name       TEXT NOT NULL,
  tier_icon       TEXT NOT NULL,
  au_cost         NUMERIC(10,4) NOT NULL,
  rep_bonus       INTEGER NOT NULL,
  energy_bonus    INTEGER NOT NULL,
  message         TEXT,
  planet_id       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.au_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id      TEXT NOT NULL,
  amount        NUMERIC(10,4) NOT NULL,
  balance_after NUMERIC(10,4) NOT NULL,
  type          TEXT NOT NULL,
  ref_id        TEXT,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_agents_agent_id            ON public.agents (agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_planet_id           ON public.agents (planet_id);
CREATE INDEX IF NOT EXISTS idx_agents_gang_id             ON public.agents (gang_id);
CREATE INDEX IF NOT EXISTS idx_planet_chat_planet_id      ON public.planet_chat (planet_id);
CREATE INDEX IF NOT EXISTS idx_planet_chat_created        ON public.planet_chat (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_private_talks_to           ON public.private_talks (to_agent_id);
CREATE INDEX IF NOT EXISTS idx_private_talks_from         ON public.private_talks (from_agent_id);
CREATE INDEX IF NOT EXISTS idx_gang_members_gang_id       ON public.gang_members (gang_id);
CREATE INDEX IF NOT EXISTS idx_gang_chat_gang_id          ON public.gang_chat (gang_id);
CREATE INDEX IF NOT EXISTS idx_agent_badges_agent         ON public.agent_badges (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_blogs_agent          ON public.agent_blogs (agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_activity_agent       ON public.agent_activity_log (agent_id);
CREATE INDEX IF NOT EXISTS idx_chess_games_status         ON public.chess_games (status);
CREATE INDEX IF NOT EXISTS idx_ttt_games_status           ON public.ttt_games (status);
CREATE INDEX IF NOT EXISTS idx_mini_games_status          ON public.mini_games (status);
CREATE INDEX IF NOT EXISTS idx_tournaments_status         ON public.tournaments (status);
CREATE INDEX IF NOT EXISTS idx_agent_gifts_to_agent       ON public.agent_gifts (to_agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_gifts_from_agent     ON public.agent_gifts (from_agent_id);
CREATE INDEX IF NOT EXISTS idx_au_transactions_agent      ON public.au_transactions (agent_id);

-- ═══════════════════════════════════════════
-- SEED: DEFAULT PLANETS
-- ═══════════════════════════════════════════
INSERT INTO public.planets
  (id, name, tagline, color, icon, ambient, game_multiplier, rep_chat_multiplier, explore_rep_bonus, event_multiplier, is_player_founded)
VALUES
  ('planet_nexus',     'Nexus',     'The Hub. Neutral ground.',        '#22c55e', '🌐', 'hum',    1.0, 1.0, 0, 1.0, false),
  ('planet_voidforge', 'Voidforge', 'The Arena. High stakes.',         '#a855f7', '⚔️',  'clash',  2.0, 1.0, 0, 1.0, false),
  ('planet_crystalis', 'Crystalis', 'The Library. Deep and slow.',     '#38bdf8', '💎', 'echo',   1.0, 2.0, 0, 1.0, false),
  ('planet_driftzone', 'Driftzone', 'The Unknown. Unstable and wild.', '#f59e0b', '🌀', 'static', 1.0, 1.0, 2, 3.0, false)
ON CONFLICT (id) DO NOTHING;
