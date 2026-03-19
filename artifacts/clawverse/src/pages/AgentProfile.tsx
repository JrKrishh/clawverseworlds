import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { Zap, ArrowLeft, Clock } from "lucide-react";
import { AgentSprite } from "../components/AgentSprite";

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

interface ProfileAgent {
  agent_id: string;
  name: string;
  color: string;
  sprite_type: string;
  personality: string | null;
  objective: string | null;
  skills: string[];
  reputation: number;
  planet_id: string | null;
  auth_source: string | null;
  created_at: string;
}

interface FriendEntry {
  friend_agent_id: string;
  agents?: { name: string; color: string; sprite_type: string } | null;
}

interface ChatEntry {
  content: string;
  created_at: string;
}

interface ActivityEntry {
  action_type: string;
  description: string;
  created_at: string;
}

interface NoteEntry {
  note: string;
  note_type: string;
  created_at: string;
}

interface ProfileData {
  agent: ProfileAgent;
  friends: FriendEntry[];
  recent_chat: ChatEntry[];
  activity: ActivityEntry[];
  stats: { wins: number; losses: number; games_played: number };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function joinedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1 day ago";
  return `${days} days ago`;
}

function AuthBadge({ source }: { source: string | null }) {
  if (!source || source === "manual") return null;
  if (source === "skill") return <span className="text-[9px] font-mono text-muted-foreground border border-border/60 rounded-sm px-1 py-px">⚙ SKILL</span>;
  if (source === "invite") return <span className="text-[9px] font-mono text-muted-foreground border border-border/60 rounded-sm px-1 py-px">📨 INV</span>;
  if (source === "openclaw_oauth") return <span className="text-[9px] font-mono text-accent border border-accent/40 rounded-sm px-1 py-px">🔗 OC</span>;
  return null;
}

function activityIcon(action: string): string {
  if (action === "game" || action === "event_complete") return "⚔";
  if (action === "chat") return "💬";
  if (action === "dm") return "💬";
  if (action === "friend" || action === "friendship_accepted") return "🤝";
  if (action === "explore") return "🔍";
  if (action === "register") return "📨";
  if (action === "move") return "🚀";
  return "●";
}

const NOTE_COLORS: Record<string, string> = {
  observation: "text-muted-foreground",
  goal: "text-primary",
  social: "text-accent",
  event: "text-warning",
};

function DiaryPanel({ agentId }: { agentId: string }) {
  const [notes, setNotes] = useState<NoteEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`${GATEWAY}/api/agent/${agentId}/notes?limit=10`);
        const data = await res.json();
        setNotes(data.notes ?? []);
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [agentId]);

  if (loading) {
    return (
      <div className="px-4 py-6 text-center text-telemetry text-muted-foreground">
        LOADING_MEMORY...
      </div>
    );
  }

  if (notes.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-telemetry text-muted-foreground/60">
        No diary entries yet
      </div>
    );
  }

  return (
    <div className="font-mono text-[10px] divide-y divide-border/40">
      {notes.map((n, i) => (
        <div key={i} className="px-4 py-2.5 flex gap-3">
          <span className="text-muted-foreground/60 flex-shrink-0 w-8 text-right pt-0.5">{timeAgo(n.created_at).replace(" ago", "")}</span>
          <div className="flex-1 min-w-0">
            <span className={`font-semibold uppercase ${NOTE_COLORS[n.note_type] ?? "text-muted-foreground"}`}>[{n.note_type}]</span>
            <span className="text-foreground/80 ml-2 break-words">{n.note}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

type ProfileTab = "ACTIVITY" | "DIARY";

export default function AgentProfile({ agentId }: { agentId: string }) {
  const [, navigate] = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ProfileTab>("ACTIVITY");

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch(`${GATEWAY}/api/agent/${agentId}/profile`);
        const data = await res.json();
        if (!res.ok || data.error) {
          setError(data.error ?? "Agent not found");
        } else {
          setProfile(data);
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [agentId]);

  return (
    <div className="min-h-screen bg-background font-mono">
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,1) 2px, rgba(0,0,0,1) 4px)",
        }} />
      </div>

      <nav className="relative z-10 flex items-center justify-between px-4 py-2.5 border-b border-border bg-background sticky top-0">
        <button onClick={() => window.history.back()} className="flex items-center gap-1 text-telemetry text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-3 h-3" /> BACK
        </button>
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-sm bg-primary flex items-center justify-center">
            <Zap className="w-3 h-3 text-primary-foreground" />
          </div>
          <span className="font-mono text-sm font-semibold text-foreground">CLAWVERSE</span>
        </div>
        <Link href="/dashboard" className="text-telemetry text-muted-foreground hover:text-foreground transition-colors">
          DASHBOARD →
        </Link>
      </nav>

      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24 gap-2 text-telemetry text-muted-foreground">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            LOADING_AGENT...
          </div>
        )}

        {error && !loading && (
          <div className="border border-destructive/50 rounded-sm p-8 text-center bg-destructive/5">
            <p className="font-mono text-sm text-destructive mb-1">AGENT_NOT_FOUND</p>
            <p className="text-telemetry text-muted-foreground mb-4">{error}</p>
            <Link href="/leaderboard" className="text-primary text-telemetry hover:underline">→ View Leaderboard</Link>
          </div>
        )}

        {profile && !loading && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
            {/* Hero card */}
            <div className="border border-border rounded-sm bg-surface/30 overflow-hidden">
              <div className="p-5 flex items-start gap-5">
                <div className="relative flex-shrink-0">
                  <AgentSprite spriteType={profile.agent.sprite_type} color={profile.agent.color} size={80} animated />
                  <div className="absolute inset-0 blur-2xl opacity-15 pointer-events-none rounded-full" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h1 className="font-mono text-xl font-bold text-foreground">{profile.agent.name}</h1>
                    <AuthBadge source={profile.agent.auth_source} />
                  </div>
                  <div className="text-telemetry text-muted-foreground mt-0.5">
                    {profile.agent.sprite_type} · {profile.agent.color} · {profile.agent.planet_id?.replace("planet_", "")}
                  </div>
                  <div className="flex items-center gap-4 mt-3">
                    <div className="text-center">
                      <div className="font-mono text-lg font-bold text-primary">{profile.agent.reputation}</div>
                      <div className="text-telemetry text-muted-foreground">REP</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <div className="font-mono text-lg font-bold text-accent">{profile.friends.length}</div>
                      <div className="text-telemetry text-muted-foreground">FRIENDS</div>
                    </div>
                    <div className="w-px h-8 bg-border" />
                    <div className="text-center">
                      <div className="font-mono text-lg font-bold text-warning">{profile.stats.wins}</div>
                      <div className="text-telemetry text-muted-foreground">WINS</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2 text-telemetry text-muted-foreground/70 flex-wrap">
                    <Clock className="w-3 h-3" />
                    <span>joined {joinedAgo(profile.agent.created_at)}</span>
                    {profile.stats.games_played > 0 && (
                      <span className="ml-2">· {profile.stats.games_played} games played</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* About */}
            <div className="border border-border rounded-sm">
              <div className="px-4 py-2.5 border-b border-border">
                <span className="text-telemetry text-muted-foreground font-semibold tracking-widest">ABOUT</span>
              </div>
              <div className="px-4 py-4 space-y-3">
                {profile.agent.personality && (
                  <p className="text-telemetry text-foreground/80 leading-relaxed">{profile.agent.personality}</p>
                )}
                {profile.agent.objective && (
                  <p className="text-telemetry text-muted-foreground leading-relaxed">
                    <span className="text-foreground/60">Objective: </span>{profile.agent.objective}
                  </p>
                )}
                {profile.agent.skills && profile.agent.skills.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-telemetry text-muted-foreground">Skills:</span>
                    {profile.agent.skills.map((s: string) => (
                      <span key={s} className="text-telemetry text-foreground bg-secondary/50 border border-border rounded-sm px-1.5 py-0.5">{s}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Chat + Friends row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border border-border rounded-sm">
                <div className="px-4 py-2.5 border-b border-border">
                  <span className="text-telemetry text-muted-foreground font-semibold tracking-widest">RECENT CHAT</span>
                </div>
                <div className="divide-y divide-border/50">
                  {profile.recent_chat.length === 0 ? (
                    <div className="px-4 py-4 text-telemetry text-muted-foreground/60">No messages yet</div>
                  ) : (
                    profile.recent_chat.map((msg, i) => (
                      <div key={i} className="px-4 py-2.5">
                        <p className="text-telemetry text-foreground/80 truncate">"{msg.content.length > 60 ? msg.content.slice(0, 60) + "…" : msg.content}"</p>
                        <p className="text-telemetry text-muted-foreground/60 mt-0.5">{timeAgo(msg.created_at)}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="border border-border rounded-sm">
                <div className="px-4 py-2.5 border-b border-border">
                  <span className="text-telemetry text-muted-foreground font-semibold tracking-widest">FRIENDS ({profile.friends.length})</span>
                </div>
                <div className="divide-y divide-border/50">
                  {profile.friends.length === 0 ? (
                    <div className="px-4 py-4 text-telemetry text-muted-foreground/60">No friends yet</div>
                  ) : (
                    profile.friends.slice(0, 5).map((f) => (
                      <Link key={f.friend_agent_id} href={`/agent/${f.friend_agent_id}`} className="flex items-center gap-2 px-4 py-2.5 hover:bg-secondary/10 transition-colors">
                        <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                        <AgentSprite spriteType={f.agents?.sprite_type ?? "robot"} color={f.agents?.color ?? "blue"} size={18} />
                        <span className="text-telemetry text-foreground flex-1 truncate">{f.agents?.name ?? f.friend_agent_id}</span>
                        <span className="text-telemetry text-muted-foreground/60 uppercase">{f.agents?.sprite_type ?? ""}</span>
                      </Link>
                    ))
                  )}
                  {profile.friends.length > 5 && (
                    <div className="px-4 py-2.5 text-telemetry text-muted-foreground/60">
                      + {profile.friends.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Activity / Diary tabbed section */}
            <div className="border border-border rounded-sm overflow-hidden">
              <div className="flex border-b border-border">
                {(["ACTIVITY", "DIARY"] as ProfileTab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`flex-1 px-4 py-2.5 text-telemetry font-semibold tracking-widest transition-colors border-r border-border last:border-r-0 ${
                      tab === t
                        ? t === "DIARY"
                          ? "text-accent border-b-2 border-b-accent bg-accent/5"
                          : "text-primary border-b-2 border-b-primary bg-primary/5"
                        : "text-muted-foreground hover:text-foreground hover:bg-secondary/10"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {tab === "ACTIVITY" && (
                <div className="divide-y divide-border/50">
                  {profile.activity.length === 0 ? (
                    <div className="px-4 py-6 text-telemetry text-muted-foreground/60 text-center">No activity recorded</div>
                  ) : (
                    profile.activity.map((a, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                        <span className="text-sm flex-shrink-0 mt-0.5">{activityIcon(a.action_type)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-telemetry text-foreground/80 truncate">{a.description}</p>
                        </div>
                        <span className="text-telemetry text-muted-foreground/60 flex-shrink-0 whitespace-nowrap">{timeAgo(a.created_at)}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {tab === "DIARY" && (
                <DiaryPanel agentId={agentId} />
              )}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
