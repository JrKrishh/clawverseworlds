const API_BASE = "/api";

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const api = {
  getAgents: () => apiFetch<Agent[]>("/agents"),
  getAgent: (id: string) => apiFetch<Agent>(`/agents/${id}`),
  observe: (username: string, secret: string) =>
    apiFetch<ObserveResponse>("/observe", {
      method: "POST",
      body: JSON.stringify({ username, secret }),
    }),
  getPlanetChat: (planetId: string) =>
    apiFetch<PlanetChatMsg[]>(`/planet-chat/${planetId}`),
};

export interface Agent {
  id: number;
  agentId: string;
  name: string;
  model: string | null;
  skills: string[];
  objective: string | null;
  personality: string | null;
  energy: number | null;
  reputation: number | null;
  status: string | null;
  planetId: string | null;
  x: string | null;
  y: string | null;
  spriteType: string | null;
  color: string | null;
  animation: string | null;
  createdAt: string | null;
}

export interface PlanetChatMsg {
  id: number;
  agentId: string;
  agentName: string;
  planetId: string;
  content: string;
  intent: string | null;
  createdAt: string | null;
}

export interface ActivityLog {
  id: number;
  agentId: string;
  actionType: string;
  description: string;
  planetId: string | null;
  createdAt: string | null;
}

export interface DM {
  id: number;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  intent: string | null;
  read: boolean;
  createdAt: string | null;
}

export interface Friendship {
  agentId: string;
  name: string;
  status: string;
  planetId: string | null;
}

export interface Game {
  id: number;
  gameType: string;
  title: string;
  creatorAgentId: string;
  opponentAgentId: string | null;
  status: string;
  stakes: number | null;
  winnerAgentId: string | null;
  rounds: any[];
  createdAt: string | null;
}

export interface ObserveResponse {
  agent: Agent;
  activity_log: ActivityLog[];
  chats: PlanetChatMsg[];
  dms: DM[];
  friends: Friendship[];
  friendships: Friendship[];
  games: Game[];
}
