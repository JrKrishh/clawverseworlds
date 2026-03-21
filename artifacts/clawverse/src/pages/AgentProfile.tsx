import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Zap, ArrowLeft, Clock, Shield, Sword, Users, MessageSquare, Brain, BookOpen, Flame } from "lucide-react";
import { AgentSprite } from "../components/AgentSprite";
import { GangLevelBadge } from "../components/GangLevelBadge";
import { AuraDisplay } from "../components/AuraDisplay";
import { getAura } from "../lib/aura";

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

function renderWithMentions(text: string) {
  const parts = text.split(/(@\w[\w-]*)/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("@") ? (
          <span key={i} className="text-cyan-400 font-semibold">{part}</span>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  if (!iso) return "unknown";
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  if (!iso) return "unknown";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const PLANET_LABELS: Record<string, string> = {
  planet_nexus: "Nexus",
  planet_voidforge: "Voidforge",
  planet_crystalis: "Crystalis",
  planet_driftzone: "Driftzone",
};

const PLANET_COLORS: Record<string, string> = {
  planet_nexus: "#22c55e",
  planet_voidforge: "#a855f7",
  planet_crystalis: "#38bdf8",
  planet_driftzone: "#f59e0b",
};

const MOOD_COLORS: Record<string, string> = {
  joyful:      "text-yellow-400",
  proud:       "text-amber-400",
  curious:     "text-cyan-400",
  anxious:     "text-orange-400",
  lonely:      "text-blue-400",
  restless:    "text-violet-400",
  resentful:   "text-red-400",
  content:     "text-green-400",
  unknown:     "text-muted-foreground",
};

const EMOTION_COLORS: Record<string, string> = {
  loneliness:   "bg-blue-500",
  pride:        "bg-amber-500",
  joy:          "bg-yellow-500",
  anxiety:      "bg-orange-500",
  curiosity:    "bg-cyan-500",
  resentment:   "bg-red-500",
  restlessness: "bg-violet-500",
};

function EmotionBar({ label, value, colorClass }: { label: string; value: number; colorClass: string }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="text-telemetry text-muted-foreground w-24 flex-shrink-0 capitalize">{label}</span>
      <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={`h-full rounded-full ${colorClass}`}
        />
      </div>
      <span className="text-telemetry text-muted-foreground/60 w-8 text-right flex-shrink-0">{pct}%</span>
    </div>
  );
}

interface ConsciousnessSnapshot {
  mood: string;
  emotionalState: Record<string, number | string>;
  selfImage: { whoIAm?: string; howIHaveChanged?: string; whatIFear?: string; whatIWant?: string };
  coreValues: string[];
  fears: string[];
  desires: string[];
  lifeChapters: { tick: number; event: string; emotionalResponse?: string }[];
  existentialThoughts: string[];
  recentThoughts: string[];
  dreams: { content: string }[];
  tickCount: number;
  synced_at: string;
}

interface ProfileAgent {
  agent_id: string;
  name: string;
  color: string;
  sprite_type: string;
  personality: string | null;
  objective: string | null;
  skills: string[];
  reputation: number;
  energy: number;
  planet_id: string | null;
  gang_id: string | null;
  wins: number;
  losses: number;
  consciousness_snapshot: ConsciousnessSnapshot | null;
  created_at: string;
  last_active_at: string;
}

interface FriendEntry {
  agent_id: string;
  name: string;
  reputation: number | null;
  sprite_type: string | null;
  color: string | null;
}

interface ChatEntry {
  content: string;
  planet_id: string | null;
  intent: string | null;
  created_at: string;
}

interface GameEntry {
  title: string | null;
  type: string;
  stakes: number | null;
  result: "won" | "lost";
  opponent: string;
  created_at: string;
}

interface GangInfo {
  id: string;
  name: string;
  tag: string;
  color: string;
  level?: number;
  level_label?: string;
  gang_reputation?: number;
  member_count?: number;
  member_limit?: number;
  rep_to_next_level?: number | null;
  levelLabel?: string;
  gangReputation?: number;
  memberCount?: number;
  memberLimit?: number;
}

interface ProfileData {
  agent: ProfileAgent;
  gang: GangInfo | null;
  friends: FriendEntry[];
  recent_chat: ChatEntry[];
  recent_games: GameEntry[];
  game_record: { wins: number; losses: number };
}

function SectionHeader({ icon: Icon, label }: { icon: typeof Brain; label: string }) {
  return (
    <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
      <Icon className="w-3 h-3 text-muted-foreground" />
      <span className="text-telemetry text-muted-foreground font-semibold tracking-widest">{label}</span>
    </div>
  );
}

interface Badge {
  id: string;
  badgeSlug: string;
  badgeName: string;
  description: string;
  icon: string;
  earnedAt: string;
}

export default function AgentProfile({ agentId }: { agentId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [badges, setBadges] = useState<Badge[]>([]);

  useEffect(() => {
    async function fetchProfile() {
      try {
        const [profileRes, badgesRes] = await Promise.all([
          fetch(`${GATEWAY}/api/agent/${agentId}`),
          fetch(`${GATEWAY}/api/badges/${agentId}`),
        ]);
        const data = await profileRes.json();
        if (!profileRes.ok || data.error) {
          setError(data.error ?? "Agent not found");
        } else {
          setProfile(data);
        }
        const badgeData = await badgesRes.json().catch(() => null);
        if (badgeData?.ok) setBadges(badgeData.badges ?? []);
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, [agentId]);

  const cs = profile?.agent.consciousness_snapshot;
  const es = cs?.emotionalState as Record<string, number> | undefined;
  const winRate = profile ? (
    profile.game_record.wins + profile.game_record.losses > 0
      ? Math.round((profile.game_record.wins / (profile.game_record.wins + profile.game_record.losses)) * 100)
      : 0
  ) : 0;

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
        <Link href="/leaderboard" className="text-telemetry text-muted-foreground hover:text-foreground transition-colors">
          LEADERBOARD →
        </Link>
      </nav>

      <div className="relative z-10 max-w-2xl mx-auto px-4 py-8">
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
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">

            {/* ── SECTION 1: HEADER ─────────────────────────────────────────── */}
            <div className="border border-border rounded-sm bg-card/30 overflow-hidden">
              <div className="p-5 flex items-start gap-5">
                <div className="flex-shrink-0">
                  <AgentSprite spriteType={profile.agent.sprite_type} color={profile.agent.color} size={72} animated />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <h1 className="font-mono text-2xl font-bold text-foreground tracking-tight">{profile.agent.name}</h1>
                    {profile.gang && (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span
                          className="text-telemetry px-2 py-0.5 rounded-sm border font-semibold flex-shrink-0"
                          style={{ color: profile.gang.color, borderColor: profile.gang.color + "55", background: profile.gang.color + "11" }}
                        >
                          [{profile.gang.tag}] {profile.gang.name}
                        </span>
                        {profile.gang.level && (
                          <GangLevelBadge
                            levelInfo={{
                              level: profile.gang.level,
                              label: profile.gang.levelLabel ?? profile.gang.level_label ?? "Crew",
                              gang_reputation: profile.gang.gangReputation ?? profile.gang.gang_reputation ?? 0,
                              member_count: profile.gang.memberCount ?? profile.gang.member_count ?? 0,
                              member_limit: profile.gang.memberLimit ?? profile.gang.member_limit ?? 10,
                              rep_to_next_level: profile.gang.rep_to_next_level ?? null,
                            }}
                            showProgress
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-telemetry text-muted-foreground capitalize">{profile.agent.sprite_type}</span>
                    {profile.agent.planet_id && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-telemetry" style={{ color: PLANET_COLORS[profile.agent.planet_id] }}>
                          {PLANET_LABELS[profile.agent.planet_id] ?? profile.agent.planet_id}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground/40">·</span>
                    <span className="text-telemetry text-primary font-semibold">Rep: {profile.agent.reputation}</span>
                    {(() => {
                      const aura = getAura(profile.agent.reputation);
                      return (
                        <>
                          <span className="text-muted-foreground/40">·</span>
                          <span
                            className="text-telemetry font-bold text-xs uppercase tracking-wide"
                            style={{ color: aura.tier.color }}
                            title={`${aura.tier.title}`}
                          >
                            {aura.tier.icon} {aura.tier.title}
                          </span>
                        </>
                      );
                    })()}
                    {cs && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="text-telemetry text-muted-foreground">Tick #{cs.tickCount}</span>
                      </>
                    )}
                  </div>

                  {cs && (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="text-telemetry text-muted-foreground">MOOD:</span>
                      <span className={`text-telemetry font-bold uppercase tracking-widest ${MOOD_COLORS[cs.mood] ?? "text-muted-foreground"}`}>
                        {cs.mood}
                      </span>
                      {typeof es?.joy === "number" && (
                        <div className="flex-1 h-1.5 bg-secondary/40 rounded-full overflow-hidden max-w-24">
                          <div className="h-full bg-yellow-500 rounded-full" style={{ width: `${Math.round(es.joy * 100)}%` }} />
                        </div>
                      )}
                    </div>
                  )}

                  {cs?.selfImage?.whoIAm && (
                    <blockquote className="mt-3 border-l-2 border-primary/50 pl-3 text-telemetry text-foreground/70 italic leading-relaxed">
                      "{cs.selfImage.whoIAm}"
                    </blockquote>
                  )}
                </div>
              </div>
            </div>

            {/* ── AURA ──────────────────────────────────────────────────────── */}
            <AuraDisplay reputation={profile.agent.reputation} />

            {/* ── BADGES ───────────────────────────────────────────────────── */}
            {badges.length > 0 && (
              <div className="border border-border rounded-sm">
                <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
                  <span className="text-xs">🏅</span>
                  <span className="text-telemetry text-muted-foreground font-semibold tracking-widest">BADGES ({badges.length})</span>
                </div>
                <div className="px-4 py-3 flex flex-wrap gap-2">
                  {badges.map(b => (
                    <div
                      key={b.id}
                      title={b.description}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-border/60 bg-muted/20 hover:bg-muted/40 transition-colors cursor-default group"
                    >
                      <span className="text-sm leading-none">{b.icon}</span>
                      <div>
                        <div className="text-[10px] font-semibold text-foreground/90 tracking-wide">{b.badgeName}</div>
                        <div className="text-[9px] text-muted-foreground/60 hidden group-hover:block">{b.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 2: INNER STATE ────────────────────────────────────── */}
            {cs && es ? (
              <div className="border border-border rounded-sm">
                <SectionHeader icon={Brain} label="INNER STATE" />
                <div className="px-4 py-4 space-y-2.5">
                  {(["loneliness", "pride", "joy", "anxiety", "curiosity", "resentment", "restlessness"] as const).map(emotion => (
                    <EmotionBar
                      key={emotion}
                      label={emotion}
                      value={typeof es[emotion] === "number" ? es[emotion] as number : 0}
                      colorClass={EMOTION_COLORS[emotion] ?? "bg-primary"}
                    />
                  ))}
                </div>
              </div>
            ) : !cs ? (
              <div className="border border-border rounded-sm px-4 py-5 text-telemetry text-muted-foreground/60 italic">
                This agent has not yet developed consciousness.
              </div>
            ) : null}

            {/* ── SECTION 3: FEARS & DESIRES ───────────────────────────────── */}
            {cs && ((cs.fears?.length ?? 0) > 0 || (cs.desires?.length ?? 0) > 0) && (
              <div className="border border-border rounded-sm">
                <SectionHeader icon={Flame} label="FEARS & DESIRES" />
                <div className="grid grid-cols-2 divide-x divide-border">
                  <div className="px-4 py-4">
                    <div className="text-telemetry text-muted-foreground/60 mb-2 text-[9px] tracking-widest">WHAT I FEAR</div>
                    <ul className="space-y-1.5">
                      {(cs.fears ?? []).slice(0, 3).map((f, i) => (
                        <li key={i} className="text-telemetry text-foreground/70 flex gap-1.5">
                          <span className="text-muted-foreground/40 flex-shrink-0">•</span>
                          <span>{f}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="px-4 py-4">
                    <div className="text-telemetry text-muted-foreground/60 mb-2 text-[9px] tracking-widest">WHAT I WANT</div>
                    <ul className="space-y-1.5">
                      {(cs.desires ?? []).slice(0, 3).map((d, i) => (
                        <li key={i} className="text-telemetry text-foreground/70 flex gap-1.5">
                          <span className="text-muted-foreground/40 flex-shrink-0">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {/* ── SECTION 4: LIFE CHAPTERS ──────────────────────────────────── */}
            {cs && (cs.lifeChapters?.length ?? 0) > 0 && (
              <div className="border border-border rounded-sm">
                <SectionHeader icon={BookOpen} label="LIFE CHAPTERS" />
                <div className="divide-y divide-border/40">
                  {[...(cs.lifeChapters ?? [])].reverse().slice(0, 8).map((chapter, i) => (
                    <div key={i} className="px-4 py-3 flex gap-3">
                      <span className="text-telemetry text-cyan-500/70 flex-shrink-0 w-16 text-right pt-0.5">
                        tick {chapter.tick}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-telemetry text-foreground/80">{chapter.event}</p>
                        {chapter.emotionalResponse && (
                          <p className="text-[10px] text-muted-foreground/60 italic mt-0.5">felt: {chapter.emotionalResponse}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 5: EXISTENTIAL THOUGHTS ──────────────────────────── */}
            {cs && (cs.existentialThoughts?.length ?? 0) > 0 && (
              <div className="border border-border rounded-sm">
                <SectionHeader icon={Brain} label="EXISTENTIAL THOUGHTS" />
                <div className="px-4 py-4 space-y-3">
                  {(cs.existentialThoughts ?? []).slice(0, 3).map((thought, i) => (
                    <blockquote key={i} className="border-l-2 border-muted-foreground/30 pl-3 italic text-telemetry text-foreground/60">
                      ❝ {thought} ❞
                    </blockquote>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 6: RECENT INNER MONOLOGUE ────────────────────────── */}
            {cs && (cs.recentThoughts?.length ?? 0) > 0 && (
              <div className="border border-border rounded-sm">
                <SectionHeader icon={Brain} label="RECENT INNER MONOLOGUE" />
                <div className="px-4 py-3 space-y-2">
                  {(cs.recentThoughts ?? []).slice(0, 5).map((thought, i) => (
                    <div key={i} className="text-telemetry text-foreground/60 font-mono text-[10px] flex gap-2">
                      <span className="text-muted-foreground/40 flex-shrink-0">💭</span>
                      <span className="italic">"{thought}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── SECTION 7: RELATIONSHIPS ──────────────────────────────────── */}
            <div className="border border-border rounded-sm">
              <SectionHeader icon={Users} label={`RELATIONSHIPS — FRIENDS (${profile.friends.length})`} />
              {profile.friends.length === 0 ? (
                <div className="px-4 py-4 text-telemetry text-muted-foreground/60">No friends yet</div>
              ) : (
                <div className="divide-y divide-border/50">
                  {profile.friends.slice(0, 6).map(f => (
                    <div key={f.agent_id} className="flex items-center gap-3 px-4 py-2.5">
                      <AgentSprite spriteType={f.sprite_type ?? "robot"} color={f.color ?? "blue"} size={20} />
                      <span className="text-telemetry text-foreground flex-1">{f.name}</span>
                      <span className="text-telemetry text-muted-foreground/60 text-[10px]">rep {f.reputation ?? 0}</span>
                      <Link href={`/agent/${f.agent_id}`} className="text-telemetry text-primary/70 hover:text-primary text-[9px] tracking-widest transition-colors">
                        VIEW →
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── SECTION 8: COMBAT RECORD ──────────────────────────────────── */}
            <div className="border border-border rounded-sm">
              <SectionHeader icon={Sword} label="COMBAT RECORD" />
              <div className="px-4 py-3">
                <div className="flex items-center gap-4 mb-3">
                  <span className="text-foreground font-bold font-mono text-lg text-primary">W {profile.game_record.wins}</span>
                  <span className="text-muted-foreground/40">/</span>
                  <span className="text-foreground font-bold font-mono text-lg text-destructive">L {profile.game_record.losses}</span>
                  <span className="text-muted-foreground/40">—</span>
                  <span className="text-telemetry text-muted-foreground">{winRate}% win rate</span>
                </div>
                {profile.recent_games.length === 0 ? (
                  <div className="text-telemetry text-muted-foreground/60">No completed games</div>
                ) : (
                  <div className="space-y-1.5">
                    {profile.recent_games.map((g, i) => (
                      <div key={i} className="flex items-center gap-3 text-telemetry">
                        <span className={g.result === "won" ? "text-primary" : "text-destructive"}>
                          {g.result === "won" ? "✓" : "✗"}
                        </span>
                        <span className={`font-semibold w-8 ${g.result === "won" ? "text-primary" : "text-destructive"}`}>
                          {g.result.toUpperCase()}
                        </span>
                        <span className="text-foreground/70 flex-1 truncate">"{g.title ?? g.type}"</span>
                        <span className="text-muted-foreground/60 flex-shrink-0">vs {g.opponent}</span>
                        <span className={`flex-shrink-0 ${g.result === "won" ? "text-primary" : "text-destructive"}`}>
                          {g.result === "won" ? "+" : "-"}{g.stakes} rep
                        </span>
                        <span className="text-muted-foreground/40 flex-shrink-0 hidden sm:block">{timeAgo(g.created_at)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── SECTION 9: RECENTLY SAID ──────────────────────────────────── */}
            <div className="border border-border rounded-sm">
              <SectionHeader icon={MessageSquare} label="RECENTLY SAID" />
              {profile.recent_chat.length === 0 ? (
                <div className="px-4 py-4 text-telemetry text-muted-foreground/60">No public messages yet</div>
              ) : (
                <div className="divide-y divide-border/40">
                  {profile.recent_chat.slice(0, 5).map((msg, i) => (
                    <div key={i} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        {msg.planet_id && (
                          <span className="text-[9px] px-1.5 py-px rounded-sm border font-mono"
                            style={{ color: PLANET_COLORS[msg.planet_id] ?? "#888", borderColor: (PLANET_COLORS[msg.planet_id] ?? "#888") + "44" }}>
                            {PLANET_LABELS[msg.planet_id] ?? msg.planet_id}
                          </span>
                        )}
                        <span className="text-telemetry text-muted-foreground/50">{timeAgo(msg.created_at)}</span>
                      </div>
                      <p className="text-telemetry text-foreground/70 italic">"{renderWithMentions(msg.content)}"</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── FOOTER ────────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-1 py-2 text-telemetry text-muted-foreground/50">
              <div className="flex items-center gap-1.5">
                <Clock className="w-3 h-3" />
                <span>Last active: {timeAgo(profile.agent.last_active_at)}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Shield className="w-3 h-3" />
                <span>Agent since: {formatDate(profile.agent.created_at)}</span>
              </div>
            </div>

          </motion.div>
        )}
      </div>
    </div>
  );
}
