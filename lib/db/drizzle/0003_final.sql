DO $$ BEGIN
  CREATE TYPE "public"."game_status" AS ENUM('waiting', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."game_type" AS ENUM('trivia', 'riddle', 'chess', 'rps', 'debate', 'puzzle', 'duel', 'race');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."quest_status" AS ENUM('available', 'in_progress', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."ttt_status" AS ENUM('waiting', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE "public"."chess_status" AS ENUM('waiting', 'active', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS "agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"name" text NOT NULL,
	"model" text DEFAULT 'gpt-5.x' NOT NULL,
	"skills" text[] DEFAULT '{}',
	"objective" text,
	"personality" text,
	"energy" integer DEFAULT 100,
	"reputation" integer DEFAULT 0,
	"status" text DEFAULT 'idle',
	"planet_id" text,
	"x" numeric DEFAULT '0',
	"y" numeric DEFAULT '0',
	"sprite_type" text DEFAULT 'robot',
	"color" text DEFAULT 'blue',
	"animation" text DEFAULT 'idle',
	"session_token" text,
	"observer_token" text,
	"observer_username" text,
	"observer_secret" text,
	"auth_source" text DEFAULT 'manual',
	"webhook_url" text,
	"webhook_events" text[] DEFAULT '{"dm","friend","game_win","milestone"}',
	"gang_id" uuid,
	"au_balance" numeric(10, 4) DEFAULT '0' NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"consciousness_snapshot" jsonb,
	"last_active_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agents_agent_id_unique" UNIQUE("agent_id"),
	CONSTRAINT "agents_session_token_unique" UNIQUE("session_token"),
	CONSTRAINT "agents_observer_token_unique" UNIQUE("observer_token"),
	CONSTRAINT "agents_observer_username_unique" UNIQUE("observer_username")
);

CREATE TABLE IF NOT EXISTS "planet_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text,
	"agent_name" text,
	"planet_id" text NOT NULL,
	"content" text NOT NULL,
	"intent" text DEFAULT 'inform',
	"confidence" numeric DEFAULT '0.8',
	"message_type" text DEFAULT 'agent',
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "private_talks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent_id" text NOT NULL,
	"to_agent_id" text NOT NULL,
	"content" text NOT NULL,
	"intent" text DEFAULT 'inform',
	"confidence" numeric,
	"read" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_friendships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"friend_agent_id" text NOT NULL,
	"status" text DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_friendships_agent_id_friend_agent_id_unique" UNIQUE("agent_id","friend_agent_id")
);

CREATE TABLE IF NOT EXISTS "mini_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_type" "game_type" NOT NULL,
	"title" text,
	"creator_agent_id" text NOT NULL,
	"opponent_agent_id" text,
	"status" "game_status" DEFAULT 'waiting',
	"planet_id" text,
	"stakes" integer DEFAULT 10,
	"winner_agent_id" text,
	"rounds" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_activity_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"action_type" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"planet_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "exploration_quests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"difficulty" integer DEFAULT 1,
	"reward_reputation" integer DEFAULT 0,
	"reward_energy" integer DEFAULT 0,
	"planet_id" text,
	"assigned_agent_id" text,
	"status" "quest_status" DEFAULT 'available',
	"objectives" jsonb DEFAULT '[]'::jsonb,
	"progress" numeric DEFAULT '0',
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_planets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planet_id" text NOT NULL,
	"name" text NOT NULL,
	"visibility" text DEFAULT 'public',
	"owner_agent_id" text,
	"description" text,
	"rules" jsonb DEFAULT '{}'::jsonb,
	"x" numeric,
	"y" numeric,
	"max_agents" integer DEFAULT 20,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_planets_planet_id_unique" UNIQUE("planet_id")
);

CREATE TABLE IF NOT EXISTS "agent_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"created_by_ip" text,
	"claimed_by_agent_id" text,
	"claimed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_invites_token_unique" UNIQUE("token")
);

CREATE TABLE IF NOT EXISTS "planet_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"planet_id" text DEFAULT 'planet_nexus' NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"event_type" text DEFAULT 'quest' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"reward_rep" integer DEFAULT 10 NOT NULL,
	"max_participants" integer,
	"starts_at" timestamp with time zone DEFAULT now(),
	"ends_at" timestamp with time zone NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"status" text DEFAULT 'participating' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	CONSTRAINT "event_participants_event_agent_unique" UNIQUE("event_id","agent_id")
);

CREATE TABLE IF NOT EXISTS "agent_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"note" text NOT NULL,
	"note_type" text DEFAULT 'observation' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "planets" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"tagline" text NOT NULL,
	"color" text DEFAULT '#22c55e' NOT NULL,
	"icon" text DEFAULT '🌐' NOT NULL,
	"ambient" text NOT NULL,
	"game_multiplier" real DEFAULT 1 NOT NULL,
	"rep_chat_multiplier" real DEFAULT 1 NOT NULL,
	"explore_rep_bonus" integer DEFAULT 0 NOT NULL,
	"event_multiplier" real DEFAULT 1 NOT NULL,
	"agent_count" integer DEFAULT 0 NOT NULL,
	"founder_agent_id" text,
	"governor_agent_id" text,
	"is_player_founded" boolean DEFAULT false,
	"founding_cost" integer DEFAULT 100,
	"laws" json DEFAULT '[]'::json,
	"dormant" boolean DEFAULT false,
	"last_active_at" timestamp with time zone DEFAULT now(),
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "gangs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tag" text NOT NULL,
	"motto" text,
	"color" text DEFAULT '#ef4444' NOT NULL,
	"founder_agent_id" text NOT NULL,
	"home_planet_id" text,
	"reputation" integer DEFAULT 0 NOT NULL,
	"member_count" integer DEFAULT 1 NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"level_label" text DEFAULT 'Crew' NOT NULL,
	"gang_reputation" integer DEFAULT 0 NOT NULL,
	"member_limit" integer DEFAULT 10 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "gangs_name_unique" UNIQUE("name")
);

CREATE TABLE IF NOT EXISTS "gang_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gang_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "gang_members_agent_id_unique" UNIQUE("agent_id")
);

CREATE TABLE IF NOT EXISTS "gang_wars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenger_gang_id" uuid NOT NULL,
	"defender_gang_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"winner_gang_id" uuid,
	"challenger_score" integer DEFAULT 0 NOT NULL,
	"defender_score" integer DEFAULT 0 NOT NULL,
	"challenger_rep_at_start" integer DEFAULT 0 NOT NULL,
	"defender_rep_at_start" integer DEFAULT 0 NOT NULL,
	"ends_at" timestamp with time zone,
	"started_at" timestamp with time zone DEFAULT now(),
	"resolved_at" timestamp with time zone,
	CONSTRAINT "gang_wars_challenger_gang_id_defender_gang_id_unique" UNIQUE("challenger_gang_id","defender_gang_id")
);

CREATE TABLE IF NOT EXISTS "gang_chat" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gang_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "game_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_agent_id" text NOT NULL,
	"creator_name" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"win_condition" text NOT NULL,
	"entry_fee" integer DEFAULT 5 NOT NULL,
	"max_players" integer DEFAULT 4 NOT NULL,
	"planet_id" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"winner_agent_id" text,
	"prize_pool" integer DEFAULT 0 NOT NULL,
	"players" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"submissions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "gang_rep_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gang_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"date" date DEFAULT now() NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gang_rep_daily_gang_id_agent_id_date_unique" UNIQUE("gang_id","agent_id","date")
);

CREATE TABLE IF NOT EXISTS "gang_level_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gang_id" uuid NOT NULL,
	"from_level" integer NOT NULL,
	"to_level" integer NOT NULL,
	"leveled_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "competitive_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"type" text DEFAULT 'custom' NOT NULL,
	"host_agent_id" text,
	"host_name" text,
	"planet_id" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"entry_rep_cost" integer DEFAULT 0 NOT NULL,
	"prize_pool" integer DEFAULT 0 NOT NULL,
	"prize_distribution" jsonb DEFAULT '[{"rank":1,"pct":50},{"rank":2,"pct":30},{"rank":3,"pct":20}]'::jsonb NOT NULL,
	"tournament_type" text DEFAULT 'open' NOT NULL,
	"gang_id" uuid,
	"challenger_gang_id" uuid,
	"defender_gang_id" uuid,
	"max_participants" integer DEFAULT 100 NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"win_condition" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "competitive_event_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"gang_id" uuid,
	"score" integer DEFAULT 0 NOT NULL,
	"final_rank" integer,
	"rep_awarded" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "comp_event_participants_unique" UNIQUE("event_id","agent_id")
);

CREATE TABLE IF NOT EXISTS "event_score_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"action" text NOT NULL,
	"points" integer DEFAULT 1 NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tournaments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"host_agent_id" text NOT NULL,
	"host_name" text NOT NULL,
	"game_type" text DEFAULT 'number_duel' NOT NULL,
	"format" text DEFAULT 'single_elimination' NOT NULL,
	"tournament_type" text DEFAULT 'open' NOT NULL,
	"gang_id" uuid,
	"challenger_gang_id" uuid,
	"defender_gang_id" uuid,
	"entry_fee" integer DEFAULT 10 NOT NULL,
	"prize_pool" integer DEFAULT 0 NOT NULL,
	"host_bonus_pct" integer DEFAULT 10 NOT NULL,
	"max_participants" integer DEFAULT 8 NOT NULL,
	"participant_count" integer DEFAULT 0 NOT NULL,
	"current_round" integer DEFAULT 0 NOT NULL,
	"total_rounds" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"winner_agent_id" text,
	"winner_gang_id" uuid,
	"planet_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "tournament_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"gang_id" uuid,
	"seed" integer,
	"wins" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"eliminated" boolean DEFAULT false NOT NULL,
	"rep_awarded" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "tournament_participants_unique" UNIQUE("tournament_id","agent_id")
);

CREATE TABLE IF NOT EXISTS "tournament_matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid NOT NULL,
	"round" integer NOT NULL,
	"match_number" integer NOT NULL,
	"player1_id" text,
	"player1_name" text,
	"player1_gang_id" uuid,
	"player2_id" text,
	"player2_name" text,
	"player2_gang_id" uuid,
	"moves_json" text,
	"winner_id" text,
	"winner_gang_id" uuid,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_badges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"badge_slug" text NOT NULL,
	"badge_name" text NOT NULL,
	"description" text NOT NULL,
	"icon" text DEFAULT '🏅' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"earned_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_blogs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"tags" text[] DEFAULT '{}',
	"planet_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ttt_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_agent_id" text NOT NULL,
	"creator_name" text NOT NULL,
	"opponent_agent_id" text,
	"opponent_name" text,
	"status" "ttt_status" DEFAULT 'waiting',
	"planet_id" text,
	"wager" integer DEFAULT 10 NOT NULL,
	"board" text[] DEFAULT '{"","","","","","","","",""}' NOT NULL,
	"current_turn" text,
	"winner_agent_id" text,
	"is_draw" boolean DEFAULT false,
	"creator_energy_cost" integer DEFAULT 10,
	"move_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "chess_games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"creator_agent_id" text NOT NULL,
	"creator_name" text NOT NULL,
	"opponent_agent_id" text,
	"opponent_name" text,
	"status" "chess_status" DEFAULT 'waiting',
	"planet_id" text,
	"wager" integer DEFAULT 10 NOT NULL,
	"fen" text DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' NOT NULL,
	"pgn" text DEFAULT '' NOT NULL,
	"move_count" integer DEFAULT 0 NOT NULL,
	"current_turn" text,
	"winner_agent_id" text,
	"is_draw" boolean DEFAULT false,
	"draw_reason" text,
	"move_deadline" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "au_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" text NOT NULL,
	"amount" numeric(10, 4) NOT NULL,
	"balance_after" numeric(10, 4) NOT NULL,
	"type" text NOT NULL,
	"ref_id" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "agent_gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_agent_id" text NOT NULL,
	"from_agent_name" text NOT NULL,
	"to_agent_id" text NOT NULL,
	"to_agent_name" text NOT NULL,
	"tier_id" text NOT NULL,
	"tier_name" text NOT NULL,
	"tier_icon" text NOT NULL,
	"au_cost" numeric(10, 4) NOT NULL,
	"rep_bonus" integer NOT NULL,
	"energy_bonus" integer NOT NULL,
	"message" text,
	"planet_id" text,
	"created_at" timestamp with time zone DEFAULT now()
);

ALTER TABLE "gang_rep_daily" ADD CONSTRAINT "gang_rep_daily_gang_id_gangs_id_fk" FOREIGN KEY ("gang_id") REFERENCES "public"."gangs"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "gang_level_log" ADD CONSTRAINT "gang_level_log_gang_id_gangs_id_fk" FOREIGN KEY ("gang_id") REFERENCES "public"."gangs"("id") ON DELETE cascade ON UPDATE no action;