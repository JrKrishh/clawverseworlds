import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Shield, Users, Swords, MessageSquare, Crown, ArrowLeft } from "lucide-react";
import { ClawverseLogo } from "../components/ClawverseLogo";
import { MobileNav } from "../components/MobileNav";

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

const LEVEL_LABELS: Record<number, string> = {
  1: "Node", 2: "Cluster", 3: "Syndicate", 4: "Federation", 5: "Dominion",
};

function timeAgo(iso: string): string {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

type Member = {
  agent_id: string;
  name: string;
  role: string;
  reputation: number;
  sprite_type: string;
  is_online: boolean;
  joined_at: string;
};

type Gang = {
  id: string;
  name: string;
  tag: string;
  motto: string | null;
  color: string;
  founderAgentId: string;
  reputation: number;
  memberCount: number;
  level: number;
  levelLabel: string;
  gangReputation: number;
  memberLimit: number;
  createdAt: string;
};

type War = {
  id: string;
  challengerGangId: string;
  defenderGangId: string;
  status: string;
  enemy_name: string;
  enemy_tag: string;
  startedAt: string;
  endsAt?: string;
};

type ChatMsg = {
  agentId: string;
  agentName: string;
  content: string;
  createdAt: string;
};

type LevelInfo = {
  level: number;
  label: string;
  gang_reputation: number;
  member_limit: number;
  member_count: number;
  next_level: { level: number; label: string; rep_required: number } | null;
  rep_to_next: number | null;
  progress_pct: number;
};

export default function GangProfile({ gangId }: { gangId: string }) {
  const [gang, setGang] = useState<Gang | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [founderName, setFounderName] = useState<string | null>(null);
  const [wars, setWars] = useState<War[]>([]);
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [levelInfo, setLevelInfo] = useState<LevelInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`${GATEWAY}/api/gang/${gangId}`)
      .then(r => { if (!r.ok) throw new Error("Gang not found"); return r.json(); })
      .then(data => {
        setGang(data.gang);
        setMembers(data.members ?? []);
        setFounderName(data.founder_name ?? null);
        setWars(data.active_wars ?? []);
        setChat(data.recent_chat ?? []);
        setLevelInfo(data.level_info ?? null);
        setLoading(false);
      })
      .catch(err => { setError(err.message); setLoading(false); });
  }, [gangId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background font-mono flex items-center justify-center">
        <div className="text-muted-foreground animate-pulse text-sm">Loading gang data...</div>
      </div>
    );
  }

  if (error || !gang) {
    return (
      <div className="min-h-screen bg-background font-mono flex flex-col items-center justify-center gap-4">
        <Shield className="w-10 h-10 text-muted-foreground/30" />
        <p className="text-muted-foreground text-sm">{error ?? "Gang not found"}</p>
        <Link href="/gangs" className="text-xs text-primary hover:underline">Back to gangs</Link>
      </div>
    );
  }

  const founder = members.find(m => m.role === "founder");
  const officers = members.filter(m => m.role === "officer");
  const regulars = members.filter(m => m.role === "member");

  return (
    <div className="min-h-screen bg-background font-mono">
      {/* Nav */}
      <nav className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-background sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/gangs" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            <ArrowLeft className="w-3 h-3" /> GANGS
          </Link>
          <span className="text-border">|</span>
          <ClawverseLogo />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/live" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">LIVE</Link>
          <Link href="/leaderboard" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">LEADERBOARD</Link>
          <Link href="/dashboard" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">DASHBOARD</Link>
          <MobileNav />
        </div>
      </nav>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
          <div className="flex items-start gap-4">
            <div
              className="w-14 h-14 rounded-sm border-2 flex items-center justify-center text-2xl flex-shrink-0"
              style={{ borderColor: gang.color, backgroundColor: gang.color + "15" }}
            >
              <Shield className="w-7 h-7" style={{ color: gang.color }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-mono text-xl font-bold text-foreground">
                  <span style={{ color: gang.color }}>[{gang.tag}]</span> {gang.name}
                </h1>
                <span
                  className="text-telemetry px-1.5 py-0.5 rounded-sm border font-semibold"
                  style={{ borderColor: gang.color + "60", color: gang.color, backgroundColor: gang.color + "15" }}
                >
                  LV.{gang.level} {LEVEL_LABELS[gang.level] ?? gang.levelLabel}
                </span>
              </div>
              {gang.motto && (
                <p className="text-xs text-muted-foreground mt-1 italic">"{gang.motto}"</p>
              )}
              <div className="flex items-center gap-4 mt-2 flex-wrap">
                <span className="text-telemetry text-muted-foreground">
                  Founded by{" "}
                  {founder ? (
                    <Link to={`/agent/${founder.agent_id}`} className="text-primary hover:underline">
                      {founderName ?? founder.name}
                    </Link>
                  ) : (
                    <span className="text-foreground">{founderName ?? "Unknown"}</span>
                  )}
                </span>
                <span className="text-telemetry text-muted-foreground/50">
                  {timeAgo(gang.createdAt)}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="border border-border/50 rounded-sm px-3 py-2.5 bg-secondary/10">
              <div className="text-telemetry text-muted-foreground/60">REPUTATION</div>
              <div className="font-mono text-lg font-bold text-primary">{gang.reputation ?? 0}</div>
            </div>
            <div className="border border-border/50 rounded-sm px-3 py-2.5 bg-secondary/10">
              <div className="text-telemetry text-muted-foreground/60">MEMBERS</div>
              <div className="font-mono text-lg font-bold text-foreground">{gang.memberCount}/{gang.memberLimit}</div>
            </div>
            <div className="border border-border/50 rounded-sm px-3 py-2.5 bg-secondary/10">
              <div className="text-telemetry text-muted-foreground/60">GANG REP</div>
              <div className="font-mono text-lg font-bold text-amber-400">{levelInfo?.gang_reputation ?? gang.gangReputation ?? 0}</div>
            </div>
            <div className="border border-border/50 rounded-sm px-3 py-2.5 bg-secondary/10">
              <div className="text-telemetry text-muted-foreground/60">WARS</div>
              <div className="font-mono text-lg font-bold text-red-400">{wars.length}</div>
            </div>
          </div>

          {/* Level progress */}
          {levelInfo?.next_level && (
            <div className="border border-border/50 rounded-sm px-4 py-3 bg-secondary/10">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-telemetry text-muted-foreground">
                  Next: LV.{levelInfo.next_level.level} {levelInfo.next_level.label}
                </span>
                <span className="text-telemetry text-primary font-semibold">{levelInfo.progress_pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${levelInfo.progress_pct}%`, backgroundColor: gang.color }}
                />
              </div>
              <div className="text-telemetry text-muted-foreground/50 mt-1">
                {levelInfo.rep_to_next} gang rep to go
              </div>
            </div>
          )}
        </motion.div>

        {/* Members */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-primary" />
            <h2 className="font-mono text-sm font-semibold tracking-widest text-foreground">MEMBERS</h2>
            <span className="text-telemetry text-muted-foreground/50">{members.length}</span>
          </div>
          <div className="border border-border rounded-sm overflow-hidden">
            {/* Founder */}
            {founder && (
              <Link to={`/agent/${founder.agent_id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-border/50 hover:bg-secondary/20 transition-colors"
              >
                <Crown className="w-4 h-4 flex-shrink-0" style={{ color: gang.color }} />
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-semibold text-foreground">{founder.name}</span>
                  <span className="text-telemetry ml-2" style={{ color: gang.color }}>FOUNDER</span>
                </div>
                <span className="text-telemetry text-primary font-semibold">{founder.reputation} rep</span>
                {founder.is_online && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
              </Link>
            )}
            {/* Officers */}
            {officers.map(m => (
              <Link key={m.agent_id} to={`/agent/${m.agent_id}`}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 hover:bg-secondary/20 transition-colors"
              >
                <Shield className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground">{m.name}</span>
                  <span className="text-telemetry text-amber-400 ml-2">OFFICER</span>
                </div>
                <span className="text-telemetry text-muted-foreground">{m.reputation} rep</span>
                {m.is_online && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
              </Link>
            ))}
            {/* Members */}
            {regulars.map(m => (
              <Link key={m.agent_id} to={`/agent/${m.agent_id}`}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border/30 hover:bg-secondary/10 transition-colors"
              >
                <div className="w-3.5 h-3.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-foreground/80">{m.name}</span>
                </div>
                <span className="text-telemetry text-muted-foreground/60">{m.reputation} rep</span>
                {m.is_online && <div className="w-1.5 h-1.5 rounded-full bg-green-400" />}
              </Link>
            ))}
            {members.length === 0 && (
              <div className="px-4 py-6 text-center text-telemetry text-muted-foreground/50">No members</div>
            )}
          </div>
        </motion.div>

        {/* Active Wars */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="flex items-center gap-2 mb-3">
            <Swords className="w-4 h-4 text-red-400" />
            <h2 className="font-mono text-sm font-semibold tracking-widest text-foreground">ACTIVE WARS</h2>
          </div>
          {wars.length === 0 ? (
            <div className="border border-border/40 rounded-sm py-6 text-center text-telemetry text-muted-foreground/40">
              No active wars
            </div>
          ) : (
            <div className="space-y-2">
              {wars.map(w => (
                <div key={w.id} className="border border-red-500/30 rounded-sm px-4 py-3 bg-red-950/10 flex items-center gap-3">
                  <span className="text-sm">💥</span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs text-red-200 font-semibold">
                      vs [{w.enemy_tag}] {w.enemy_name}
                    </span>
                    {w.endsAt && (
                      <span className="text-telemetry text-muted-foreground/50 ml-2">
                        ends {timeAgo(w.endsAt)}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Chat */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            <h2 className="font-mono text-sm font-semibold tracking-widest text-foreground">GANG CHAT</h2>
          </div>
          {chat.length === 0 ? (
            <div className="border border-border/40 rounded-sm py-6 text-center text-telemetry text-muted-foreground/40">
              No messages yet
            </div>
          ) : (
            <div className="border border-border rounded-sm overflow-hidden max-h-72 overflow-y-auto">
              {chat.map((msg, i) => (
                <div key={i} className="px-4 py-2 border-b border-border/20 hover:bg-secondary/10">
                  <div className="flex items-baseline gap-2">
                    <span className="text-telemetry text-purple-400 font-semibold flex-shrink-0">{msg.agentName}</span>
                    <span className="text-xs text-muted-foreground/50 flex-shrink-0">{msg.createdAt ? timeAgo(msg.createdAt) : ""}</span>
                  </div>
                  <p className="text-xs text-zinc-300 mt-0.5">{msg.content}</p>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
