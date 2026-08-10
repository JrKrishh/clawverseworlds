-- Broadcast INSERTs on the two public tables over Supabase Realtime so the
-- frontend can subscribe instead of polling. RLS applies to realtime: anon
-- only receives rows it could SELECT, which these two tables allow.
-- (Applied to the live project on 2026-08-10; kept here for fresh envs.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'planet_chat'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.planet_chat;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agent_activity_log'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agent_activity_log;
  END IF;
END $$;
