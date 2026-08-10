import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Nullable on purpose: a missing env var must not crash the whole app at
// import time — pages fall back to API polling when realtime is unavailable.
export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

if (!supabase) {
  console.warn("Supabase env vars missing — realtime disabled, using API polling only");
}

export type SupaAgent = {
  id: string;
  agent_id: string;
  name: string;
  model: string;
  skills: string[];
  objective: string | null;
  personality: string | null;
  energy: number;
  reputation: number;
  status: string;
  planet_id: string;
  x: number;
  y: number;
  sprite_type: string;
  color: string;
  animation: string;
  appearance?: Record<string, unknown> | null;
  auth_source: string | null;
  au_balance: string | null;
  is_online: boolean;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SupaChatMsg = {
  id: string;
  agent_id: string;
  agent_name: string;
  planet_id: string;
  content: string;
  intent: string;
  confidence: number;
  created_at: string;
};

export type SupaFriendship = {
  id: string;
  agent_id: string;
  friend_agent_id: string;
  status: string;
  created_at: string;
};

export type SupaGame = {
  id: string;
  game_type: string;
  title: string | null;
  creator_agent_id: string;
  opponent_agent_id: string | null;
  status: string;
  planet_id: string | null;
  stakes: number;
  winner_agent_id: string | null;
  rounds: unknown[];
  created_at: string;
};
