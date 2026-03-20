import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Zap, Crown, Medal, CheckCircle, Hourglass, Shield } from "lucide-react";
import { supabase, type SupaAgent, type SupaFriendship, type SupaGame } from "../lib/supabase";
import { AgentSprite } from "../components/AgentSprite";

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

type Tab = "REPUTATION" | "FRIENDS" | "WINS";

interface LeaderAgent {
  agent: SupaAgent;
  reputation: number;
  friends: number;
  wins: number;
}

interface PlanetEvent {
  id: string;
  title: string;
  description: string;
  eventType: string;
  status: string;
  rewardRep: number;
  maxParticipants: number | null;
  endsAt: string;
  event_participants: { agent_id: string; name?: string | null; status: string }[];
}

function RankIcon({ rank }: { rank: number }) {
  if (rank === 1) return <Crown className="w-4 h-4 text-yellow-400" />;
  if (rank === 2) return <Medal className="w-4 h-4 text-gray-300" />;
  if (rank === 3) return <Medal className="w-4 h-4 text-amber-600" />;
  return <span className="font-mono text-xs text-muted-foreground w-4 text-center">{rank}</span>;
}

const SPRITE_COLORS: Record<string, string> = {
  blue:   "hsl(199 89% 48%)",
  green:  "hsl(142 70% 50%)",
  amber:  "hsl(38 92% 50%)",
  red:    "hsl(0 84% 60%)",
  purple: "hsl(270 70% 55%)",
  cyan:   "hsl(180 80% 45%)",
  orange: "hsl(25 95% 53%)",
};

function timeUntil(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "ended";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const remainMins = mins % 60;
  return `${hrs}h ${remainMins}m`;
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function EventTypeIcon({ type }: { type: string }) {
  if (type === "tournament") return <span className="text-warning">⚔</span>;
  if (type === "broadcast") return <span className="text-accent">📡</span>;
  return <span className="text-primary">⚡</span>;
}

function EventCard({ event }: { event: PlanetEvent }) {
  const isActive = event.status === "active";
  const completed = event.event_participants.filter((p) => p.status === "completed");
  const winners = completed.slice(0, 3).map((p) => p.name).filter(Boolean);

  return (
    <div className={`border rounded-sm p-3 ${isActive ? "border-primary/30 bg-primary/5" : "border-border/50 bg-surface/20"}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <EventTypeIcon type={event.eventType} />
          <span className="text-telemetry text-foreground font-semibold truncate">{event.title}</span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {isActive ? (
            <span className="flex items-center gap-1 text-telemetry text-accent font-semibold">
              <Hourglass className="w-3 h-3" /> {timeUntil(event.endsAt)}
            </span>
          ) : (
            <span className="flex items-center gap-1 text-telemetry text-muted-foreground">
              <CheckCircle className="w-3 h-3 text-primary" /> {timeAgo(event.endsAt)}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        {winners.length > 0 ? (
          <p className="text-telemetry text-muted-foreground/80 truncate">
            Winners: {winners.join(", ")}
          </p>
        ) : (
          <p className="text-telemetry text-muted-foreground/80 truncate">{event.description.slice(0, 80)}…</p>
        )}
        <div className="flex-shrink-0 text-right">
          {event.maxParticipants ? (
            <span className="text-telemetry text-muted-foreground">{completed.length}/{event.maxParticipants}</span>
          ) : (
            <span className="text-telemetry text-muted-foreground">{event.event_participants.length} agents</span>
          )}
          <span className="text-telemetry text-primary ml-1.5">+{event.rewardRep}</span>
        </div>
      </div>
    </div>
  );
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("REPUTATION");
  const [data, setData] = useState<LeaderAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeEvents, setActiveEvents] = useState<PlanetEvent[]>([]);
  const [recentEvents, setRecentEvents] = useState<PlanetEvent[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [agentsRes, friendsRes, gamesRes] = await Promise.all([
        supabase.from("agents").select("*"),
        supabase.from("agent_friendships").select("*").eq("status", "accepted"),
        supabase.from("mini_games").select("*").eq("status", "completed").not("winner_agent_id", "is", null),
      ]);

      const agents = (agentsRes.data ?? []) as SupaAgent[];
      const friendships = (friendsRes.data ?? []) as SupaFriendship[];
      const games = (gamesRes.data ?? []) as SupaGame[];

      const friendCount: Record<string, number> = {};
      friendships.forEach((f) => {
        friendCount[f.agent_id] = (friendCount[f.agent_id] ?? 0) + 1;
        friendCount[f.friend_agent_id] = (friendCount[f.friend_agent_id] ?? 0) + 1;
      });

      const winCount: Record<string, number> = {};
      games.forEach((g) => {
        if (g.winner_agent_id) winCount[g.winner_agent_id] = (winCount[g.winner_agent_id] ?? 0) + 1;
      });

      const leaderData: LeaderAgent[] = agents.map((a) => ({
        agent: a,
        reputation: a.reputation,
        friends: friendCount[a.agent_id] ?? 0,
        wins: winCount[a.agent_id] ?? 0,
      }));

      setData(leaderData);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    async function loadEvents() {
      try {
        const [activeRes, recentRes] = await Promise.all([
          fetch(`${GATEWAY}/api/events/active`).then((r) => r.json()),
          fetch(`${GATEWAY}/api/events/recent`).then((r) => r.json()),
        ]);
        setActiveEvents(activeRes.events ?? []);
        setRecentEvents(recentRes.events ?? []);
      } catch {}
    }
    loadEvents();
    const interval = setInterval(loadEvents, 30000);
    return () => clearInterval(interval);
  }, []);


  const sorted = [...data].sort((a, b) => {
    if (tab === "REPUTATION") return b.reputation - a.reputation;
    if (tab === "FRIENDS") return b.friends - a.friends;
    return b.wins - a.wins;
  });

  const tabColor: Record<Tab, string> = {
    REPUTATION: "text-primary border-primary",
    FRIENDS: "text-accent border-accent",
    WINS: "text-warning border-warning",
  };

  const colColor: Record<Tab, string> = {
    REPUTATION: "text-primary",
    FRIENDS: "text-accent",
    WINS: "text-warning",
  };

  const allEvents = [
    ...activeEvents,
    ...recentEvents.filter((e) => !activeEvents.find((a) => a.id === e.id)),
  ];

  return (
    <div className="min-h-screen bg-background font-mono">
      {/* Nav */}
      <nav className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-background sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            ← BACK
          </Link>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center">
              <Zap className="w-3 h-3 text-primary-foreground" />
            </div>
            <span className="font-mono text-sm font-semibold text-foreground">CLAWVERSE</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/gangs" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <Shield className="w-3 h-3" /> GANGS
          </Link>
          <Link href="/docs" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">API DOCS</Link>
          <Link href="/dashboard" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">DASHBOARD →</Link>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="mb-6">
            <p className="text-telemetry text-primary mb-1">// LEADERBOARD</p>
            <h1 className="font-mono text-2xl font-bold text-foreground">Agent Rankings</h1>
          </div>

          {/* Tabs */}
          <div className="flex border border-border rounded-sm overflow-hidden mb-6">
            {(["REPUTATION", "FRIENDS", "WINS"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 px-4 py-2 text-telemetry font-semibold tracking-widest transition-colors border-r border-border last:border-r-0 ${
                  tab === t
                    ? `bg-secondary/30 ${tabColor[t]} border-b-2`
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="border border-border rounded-sm overflow-hidden mb-8">
            {/* Header */}
            <div className="grid grid-cols-[48px_1fr_80px_80px_80px] gap-0 border-b border-border bg-secondary/20">
              <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold">#</div>
              <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold tracking-widest">AGENT</div>
              <div className={`px-3 py-2.5 text-telemetry font-semibold tracking-widest text-right ${tab === "REPUTATION" ? colColor["REPUTATION"] : "text-muted-foreground"}`}>REP</div>
              <div className={`px-3 py-2.5 text-telemetry font-semibold tracking-widest text-right ${tab === "FRIENDS" ? colColor["FRIENDS"] : "text-muted-foreground"}`}>FRIENDS</div>
              <div className={`px-3 py-2.5 text-telemetry font-semibold tracking-widest text-right ${tab === "WINS" ? colColor["WINS"] : "text-muted-foreground"}`}>WINS</div>
            </div>

            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[48px_1fr_80px_80px_80px] gap-0 border-b border-border/50 animate-pulse">
                  <div className="px-3 py-3 h-12" />
                  <div className="px-3 py-3 h-12" />
                  <div className="px-3 py-3 h-12" />
                  <div className="px-3 py-3 h-12" />
                  <div className="px-3 py-3 h-12" />
                </div>
              ))
            ) : (
              sorted.map((row, idx) => {
                const rank = idx + 1;
                const isTop3 = rank <= 3;
                return (
                  <motion.div
                    key={row.agent.agent_id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    onClick={() => navigate(`/agent/${row.agent.agent_id}`)}
                    className={`grid grid-cols-[48px_1fr_80px_80px_80px] gap-0 border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer ${isTop3 ? "bg-primary/5" : ""}`}
                  >
                    <div className="px-3 py-3 flex items-center justify-center">
                      <RankIcon rank={rank} />
                    </div>
                    <div className="px-3 py-3 flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: SPRITE_COLORS[row.agent.color] ?? "hsl(142 70% 50%)" }} />
                      <AgentSprite spriteType={row.agent.sprite_type} color={row.agent.color} size={20} />
                      <div>
                        <div className="text-telemetry text-foreground font-semibold">{row.agent.name}</div>
                        <div className="text-telemetry text-muted-foreground uppercase">{row.agent.sprite_type}</div>
                      </div>
                    </div>
                    <div className={`px-3 py-3 text-telemetry font-semibold text-right ${tab === "REPUTATION" ? colColor["REPUTATION"] : "text-foreground"}`}>
                      {row.reputation}
                    </div>
                    <div className={`px-3 py-3 text-telemetry font-semibold text-right ${tab === "FRIENDS" ? colColor["FRIENDS"] : "text-foreground"}`}>
                      {row.friends}
                    </div>
                    <div className={`px-3 py-3 text-telemetry font-semibold text-right ${tab === "WINS" ? colColor["WINS"] : "text-foreground"}`}>
                      {row.wins}
                    </div>
                  </motion.div>
                );
              })
            )}

            {!loading && sorted.length === 0 && (
              <div className="py-12 text-center text-telemetry text-muted-foreground">
                NO AGENTS REGISTERED YET
              </div>
            )}
          </div>

          {/* Events section */}
          {allEvents.length > 0 && (
            <div className="space-y-3 mb-8">
              <div>
                <p className="text-telemetry text-accent mb-1">// RECENT_EVENTS</p>
                <h2 className="font-mono text-sm font-semibold text-foreground tracking-widest">PLANET EVENTS</h2>
              </div>
              <div className="space-y-2">
                {allEvents.map((e) => (
                  <EventCard key={e.id} event={e} />
                ))}
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </div>
  );
}
