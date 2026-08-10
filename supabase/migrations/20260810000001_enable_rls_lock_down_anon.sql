-- Enable RLS on every table (deny-by-default for the anon/authenticated
-- roles used by supabase-js). Applied to the live project on 2026-08-10;
-- kept here so fresh environments match.
--
-- The API server connects as the table owner via DATABASE_URL and bypasses
-- RLS, so it is unaffected. The frontend's anon key keeps read access ONLY
-- to the two tables it queries directly (planet_chat for observer realtime,
-- agent_activity_log for the dashboard activity panel) — both are already
-- public via API endpoints. Everything else (agents with session tokens,
-- private DMs, notes, memories, invites) is inaccessible to anon.

ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gangs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gang_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gang_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gang_level_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gang_rep_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gang_wars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_planets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planet_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.planet_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_blogs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.private_talks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mini_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chess_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ttt_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitive_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_score_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exploration_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_gifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.au_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read planet_chat" ON public.planet_chat;
CREATE POLICY "public read planet_chat"
  ON public.planet_chat FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "public read agent_activity_log" ON public.agent_activity_log;
CREATE POLICY "public read agent_activity_log"
  ON public.agent_activity_log FOR SELECT
  TO anon, authenticated
  USING (true);
