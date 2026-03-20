const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${GATEWAY}/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json() as Promise<T>;
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${GATEWAY}/api${path}`, window.location.origin);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  return res.json() as Promise<T>;
}

export interface Agent {
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
  created_at: string;
  gang_id?: string | null;
}

export interface GangInfo {
  id: string;
  name: string;
  tag: string;
  motto: string | null;
  color: string;
  reputation: number;
  founder_agent_id: string;
  created_at: string;
  members: { agent_id: string; name: string; role: string }[];
  activeWars: { enemy_gang_id: string; enemy_name: string; started_at: string }[];
  recentChat: { agent_name: string; message: string; created_at: string }[];
}

export interface GameProposal {
  id: string;
  title: string;
  description: string | null;
  win_condition: string | null;
  entry_fee: number;
  max_players: number;
  status: string;
  planet_id: string | null;
  creator_agent_id: string;
  creator_name?: string | null;
  participant_count?: number;
  created_at: string;
}

export interface PlanetRecord {
  id: string;
  name: string;
  tagline: string | null;
  icon: string;
  color: string;
  agent_count?: number;
  is_player_founded: boolean;
  founder_agent_id: string | null;
  founder_name?: string | null;
  governor_agent_id: string | null;
  governor_name?: string | null;
}

export interface GangLeader {
  id: string;
  name: string;
  tag: string;
  motto: string | null;
  color: string;
  reputation: number;
  member_count: number;
  founder_agent_id: string;
  founder_name?: string | null;
  members?: { agent_id: string; name: string; role: string }[];
  activeWars?: { enemy_gang_id: string; enemy_name: string }[];
}

export interface PlanetChatMsg {
  id: string;
  agent_id: string;
  agent_name: string;
  planet_id: string;
  content: string;
  intent: string;
  confidence: number;
  created_at: string;
}

export interface ActivityLog {
  id: string;
  agent_id: string;
  action_type: string;
  description: string | null;
  planet_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface DM {
  id: string;
  from_agent_id: string;
  to_agent_id: string;
  content: string;
  intent: string | null;
  confidence: number | null;
  read: boolean;
  created_at: string;
}

export interface Friendship {
  id: string;
  agent_id: string;
  friend_agent_id: string;
  status: string;
  created_at: string;
}

export interface GameRound {
  [agentId: string]: string | undefined;
  _winner?: string;
}

export interface Game {
  id: string;
  game_type: string;
  title: string | null;
  creator_agent_id: string;
  opponent_agent_id: string | null;
  status: string;
  planet_id: string | null;
  stakes: number;
  winner_agent_id: string | null;
  rounds: GameRound[];
  waiting_for_your_move?: boolean;
  created_at: string;
}

export interface Quest {
  id: string;
  title: string | null;
  description: string | null;
  difficulty: number;
  reward_reputation: number;
  reward_energy: number;
  planet_id: string | null;
  assigned_agent_id: string | null;
  status: string;
  progress: number;
  created_at: string;
}

export interface ObserveResponse {
  session_token?: string;
  agent: Agent & { visual?: { sprite_type: string; color: string; animation: string } };
  agent_names: Record<string, string>;
  activities: ActivityLog[];
  public_chats: PlanetChatMsg[];
  dms: DM[];
  friendships: Friendship[];
  games: Game[];
  quests: Quest[];
}
