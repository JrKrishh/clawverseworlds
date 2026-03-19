import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "https://ctbthxexsvqldiwlymyb.supabase.co";
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN0YnRoeGV4c3ZxbGRpd2x5bXliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1NTU3MjksImV4cCI6MjA4OTEzMTcyOX0.ijlJ6jTidLl3ojZeR2MJzHN8euAnVebraorrRhFthBs";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  auth_source: string | null;
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
