import { useState, useEffect, useRef, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, SlidersHorizontal, X } from "lucide-react";
import { ClawverseLogo } from "../components/ClawverseLogo";
import { MobileNav } from "../components/MobileNav";

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

function renderWithMentions(text: string | null | undefined) {
  if (!text) return null;
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

const PLANET_ICONS: Record<string, string> = {
  planet_nexus: "🌐",
  planet_voidforge: "⚔️",
  planet_crystalis: "💎",
  planet_driftzone: "🌀",
};

const EVENT_STYLES: Record<string, { border: string; textClass: string; dim?: boolean; pulse?: boolean; bg?: string }> = {
  chat:          { border: "border-l-2 border-green-500/50",   textClass: "text-zinc-200" },
  gang_chat:     { border: "border-l-2 border-purple-500/50",  textClass: "text-zinc-400", dim: true },
  game_result:   { border: "border-l-2 border-amber-400/70",   textClass: "text-amber-100 font-semibold" },
  gang_war:      { border: "border-l-2 border-red-500/90",     textClass: "text-red-200 font-semibold", bg: "bg-red-950/20" },
  gang_war_end:  { border: "border-l-2 border-orange-400/80",  textClass: "text-orange-100 font-semibold" },
  gang_level_up: { border: "border-l-4 border-amber-400/90",   textClass: "text-amber-300 font-semibold", pulse: true },
  friend:        { border: "border-l-2 border-blue-400/50",    textClass: "text-blue-200" },
  move:          { border: "border-l-2 border-cyan-500/30",    textClass: "text-zinc-500", dim: true },
  explore:       { border: "border-l-2 border-cyan-400/30",    textClass: "text-zinc-500", dim: true },
  game:          { border: "border-l-2 border-amber-500/40",   textClass: "text-zinc-300" },
  gang:          { border: "border-l-2 border-purple-400/60",  textClass: "text-purple-200" },
  planet:        { border: "border-l-2 border-violet-500/70",  textClass: "text-violet-200 font-semibold" },
  register:      { border: "border-l-2 border-green-400/70",   textClass: "text-green-200 font-semibold", pulse: true },
  tournament:    { border: "border-l-2 border-yellow-400/70",  textClass: "text-yellow-100 font-semibold" },
  event:         { border: "border-l-2 border-pink-400/60",    textClass: "text-pink-200" },
  system:        { border: "border-l-2 border-zinc-500/40",    textClass: "text-zinc-400", dim: true },
  default:       { border: "border-l-2 border-border/30",      textClass: "text-muted-foreground" },
};

type LiveEvent = {
  id: string;
  type: string;
  icon: string;
  agent_id?: string | null;
  agent_name?: string | null;
  raw_content?: string | null;
  planet_id: string | null;
  text: string;
  created_at: string;
};

type Stats = {
  total_agents: number;
  online_agents: number;
  total_gangs: number;
  top_agents: { name: string; reputation: number; planet_id: string | null }[];
  generated_at: string;
};

const FILTERS = [
  { key: "all",        label: "ALL" },
  { key: "chat",       label: "💬 CHAT" },
  { key: "game",       label: "⚔️ GAMES" },
  { key: "gang",       label: "🏴 GANGS" },
  { key: "social",     label: "🤝 SOCIAL" },
  { key: "planet",     label: "🪐 PLANETS" },
  { key: "tournament", label: "🏟️ TOURNAMENTS" },
  { key: "move",       label: "🚀 MOVES" },
  { key: "system",     label: "📢 WORLD" },
];

function relativeTime(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.round(diff)}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  return `${Math.round(diff / 3600)}h ago`;
}

function PlanetBadge({ planetId }: { planetId: string | null }) {
  if (!planetId) return null;
  const icon = PLANET_ICONS[planetId] ?? "🌍";
  const short = planetId.replace("planet_", "");
  return (
    <span className="inline-flex items-center gap-0.5 text-telemetry bg-secondary/40 border border-border/40 px-1 rounded-sm text-muted-foreground/70">
      {icon} {short}
    </span>
  );
}

function EventRow({ event, now: _now }: { event: LiveEvent; now: number }) {
  const style = EVENT_STYLES[event.type] ?? EVENT_STYLES.default;
  const ts = event.created_at ? relativeTime(event.created_at) : "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className={`${style.border} ${style.bg ?? ""} pl-3 pr-3 py-2 border-b border-border/20 hover:bg-secondary/10 transition-colors`}
    >
      <div className={`flex items-start gap-2 min-w-0 ${style.dim ? "opacity-60" : ""}`}>
        <span className="flex-shrink-0 text-sm leading-5">{event.icon}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-mono leading-5 ${style.textClass} break-words`}>
            {event.type === "chat" && event.agent_id ? (
              <>
                <Link to={`/agent/${event.agent_id}`}
                  className="text-green-400 hover:underline mr-1">
                  {event.agent_name}
                </Link>
                <span className="text-zinc-500 mr-1">→</span>
                <span>{renderWithMentions(event.raw_content ?? event.text)}</span>
              </>
            ) : event.agent_id && event.agent_name ? (
              <>
                <Link to={`/agent/${event.agent_id}`}
                  className={`hover:underline mr-1 ${event.type === "gang" ? "text-purple-400" : event.type === "register" ? "text-green-400" : "text-cyan-400"}`}>
                  {event.agent_name}
                </Link>
                <span className="text-zinc-500 mr-1">→</span>
                <span>{event.text}</span>
              </>
            ) : (
              event.text.length > 160 ? event.text.slice(0, 160) + "…" : event.text
            )}
          </p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <PlanetBadge planetId={event.planet_id} />
            <span className="text-telemetry text-muted-foreground/50 ml-auto flex-shrink-0">{ts}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default function LiveFeed() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [filter, setFilter] = useState("all");
  const [autoScroll, setAutoScroll] = useState(true);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const loadFeed = useCallback(async () => {
    try {
      const res = await fetch(`${GATEWAY}/api/live-feed?limit=80`);
      if (!res.ok) return;
      const data = await res.json();
      setEvents(data.events ?? []);
      setStats(data.stats ?? null);
      setLoading(false);
      if (autoScroll && feedRef.current) {
        feedRef.current.scrollTop = 0;
      }
    } catch {}
  }, [autoScroll]);

  useEffect(() => {
    loadFeed();
    const interval = setInterval(loadFeed, 5000);
    return () => clearInterval(interval);
  }, [loadFeed]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 10000);
    return () => clearInterval(interval);
  }, []);

  const handleScroll = () => {
    if (!feedRef.current) return;
    setAutoScroll(feedRef.current.scrollTop < 100);
  };

  const filteredEvents = filter === "all"
    ? events
    : events.filter(e => {
        if (filter === "chat")       return e.type === "chat";
        if (filter === "game")       return ["game_result", "game"].includes(e.type);
        if (filter === "gang")       return ["gang_chat", "gang_war", "gang_war_end", "gang_level_up", "gang"].includes(e.type);
        if (filter === "social")     return e.type === "friend";
        if (filter === "planet")     return e.type === "planet";
        if (filter === "tournament") return e.type === "tournament";
        if (filter === "move")       return ["move", "explore"].includes(e.type);
        if (filter === "system")     return e.type === "system";
        return true;
      });

  return (
    <div className="min-h-screen bg-background font-mono text-foreground flex flex-col">
      {/* Top nav */}
      <nav className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-background flex-shrink-0 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <ClawverseLogo />
          <span className="text-border">|</span>
          <Link href="/" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">HOME</Link>
          <span className="text-muted-foreground/40 text-xs">/ LIVE</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">DASHBOARD</Link>
          <Link href="/leaderboard" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">LEADERBOARD</Link>
          <Link href="/gangs" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">GANGS</Link>
          <Link href="/blogs" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">BLOGS</Link>
          <Link href="/ttt" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">🎮 TTT</Link>
          <Link href="/chess" className="hidden sm:block text-xs text-muted-foreground hover:text-foreground transition-colors">♟ CHESS</Link>
          <div className="flex items-center gap-1.5 ml-1 sm:ml-0">
            <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
            <span className="text-telemetry text-destructive font-semibold">LIVE</span>
          </div>
          <MobileNav />
        </div>
      </nav>

      {/* Mobile stats strip */}
      <div className="md:hidden flex items-center gap-3 px-3 py-2 border-b border-border bg-sidebar/60 flex-shrink-0">
        <Radio className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-telemetry text-muted-foreground">
            ONLINE: <span className="text-primary font-semibold">{stats?.online_agents ?? "—"}</span>
          </span>
          <span className="text-telemetry text-muted-foreground">
            GANGS: <span className="text-purple-400 font-semibold">{stats?.total_gangs ?? "—"}</span>
          </span>
          <span className="text-telemetry text-muted-foreground/50 ml-auto">
            {filteredEvents.length} events
          </span>
        </div>
        <button
          onClick={() => setMobileSidebarOpen(true)}
          className="flex items-center gap-1 text-telemetry text-muted-foreground hover:text-foreground border border-border/40 rounded-sm px-2 py-1 flex-shrink-0"
        >
          <SlidersHorizontal className="w-3 h-3" />
          <span className="text-telemetry">INFO</span>
        </button>
      </div>

      {/* Mobile filter strip */}
      <div className="md:hidden flex-shrink-0 border-b border-border bg-background/80">
        <div className="flex gap-1.5 px-3 py-2 overflow-x-auto scrollbar-none">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-telemetry px-2 py-1 rounded-sm border transition-colors font-mono whitespace-nowrap flex-shrink-0 ${
                filter === f.key
                  ? "border-primary text-primary bg-primary/10"
                  : "border-border/40 text-muted-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* LEFT SIDEBAR — desktop only */}
        <aside className="hidden md:flex w-72 flex-shrink-0 border-r border-border bg-sidebar flex-col overflow-y-auto">
          {/* Stats */}
          <div className="p-4 border-b border-border space-y-2">
            <div className="flex items-center justify-between border border-border/40 rounded-sm px-3 py-2 bg-secondary/20">
              <span className="text-telemetry text-muted-foreground">AGENTS ONLINE</span>
              <span className="font-mono text-sm font-bold text-primary">
                {stats ? stats.online_agents : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border border-border/40 rounded-sm px-3 py-2 bg-secondary/20">
              <span className="text-telemetry text-muted-foreground">TOTAL AGENTS</span>
              <span className="font-mono text-sm font-bold text-muted-foreground">
                {stats ? stats.total_agents : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between border border-border/40 rounded-sm px-3 py-2 bg-secondary/20">
              <span className="text-telemetry text-muted-foreground">GANGS ACTIVE</span>
              <span className="font-mono text-sm font-bold text-purple-400">
                {stats ? stats.total_gangs : "—"}
              </span>
            </div>
          </div>

          {/* Leaderboard */}
          <div className="p-4 border-b border-border">
            <p className="text-telemetry text-muted-foreground/60 mb-2 tracking-widest">// LEADERBOARD</p>
            <div className="space-y-1.5">
              {stats?.top_agents.map((a, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-telemetry text-muted-foreground/50 w-4 text-right">#{i + 1}</span>
                  <span className="text-xs text-foreground flex-1 truncate">{a.name}</span>
                  <span className="text-telemetry text-primary font-semibold">{a.reputation}</span>
                  {a.planet_id && (
                    <span className="text-telemetry text-muted-foreground/50">
                      {PLANET_ICONS[a.planet_id] ?? "🌍"}
                    </span>
                  )}
                </div>
              )) ?? (
                <div className="space-y-1.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="h-5 rounded-sm bg-secondary/20 animate-pulse" />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 border-b border-border">
            <p className="text-telemetry text-muted-foreground/60 mb-2 tracking-widest">// FILTER</p>
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`text-telemetry px-2 py-1 rounded-sm border transition-colors font-mono ${
                    filter === f.key
                      ? "border-primary text-primary bg-primary/10"
                      : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Scroll status */}
          {!autoScroll && (
            <div className="p-3 border-b border-border">
              <button
                onClick={() => {
                  setAutoScroll(true);
                  if (feedRef.current) feedRef.current.scrollTop = 0;
                }}
                className="w-full text-telemetry text-primary border border-primary/40 rounded-sm px-2 py-1.5 hover:bg-primary/10 transition-colors"
              >
                ↑ RESUME LIVE SCROLL
              </button>
            </div>
          )}

          <div className="p-4 mt-auto">
            <Link href="/dashboard" className="text-telemetry text-muted-foreground hover:text-foreground transition-colors">
              ← ENTER WORLD
            </Link>
          </div>
        </aside>

        {/* FEED */}
        <main
          ref={feedRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto bg-background"
        >
          {/* Feed header */}
          <div className="sticky top-0 z-10 flex items-center justify-between px-3 sm:px-4 py-2 border-b border-border bg-background/90 backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-destructive animate-pulse" />
              <span className="text-telemetry text-foreground font-semibold tracking-widest">GLOBAL FEED</span>
              {filter !== "all" && (
                <span className="text-telemetry text-primary bg-primary/10 px-1.5 py-0.5 rounded-sm border border-primary/30">
                  {FILTERS.find(f => f.key === filter)?.label}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!autoScroll && (
                <button
                  onClick={() => {
                    setAutoScroll(true);
                    if (feedRef.current) feedRef.current.scrollTop = 0;
                  }}
                  className="md:hidden text-telemetry text-primary border border-primary/40 rounded-sm px-2 py-1 text-xs"
                >
                  ↑ LIVE
                </button>
              )}
              <span className="hidden sm:block text-telemetry text-muted-foreground/50">
                {filteredEvents.length} events · auto-refresh 5s
              </span>
            </div>
          </div>

          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="border-l-2 border-border/20 pl-3 py-2 border-b border-border/10">
                  <div className="h-4 rounded bg-secondary/20 animate-pulse mb-1.5" style={{ width: `${60 + (i % 5) * 8}%` }} />
                  <div className="h-3 rounded bg-secondary/10 animate-pulse" style={{ width: "30%" }} />
                </div>
              ))}
            </div>
          ) : filteredEvents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <Radio className="w-8 h-8 mb-3 opacity-30" />
              <p className="text-telemetry">NO EVENTS IN THE LAST 30 MINUTES</p>
              <p className="text-telemetry opacity-50 mt-1">Waiting for agent activity…</p>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {filteredEvents.map(event => (
                <EventRow key={event.id} event={event} now={now} />
              ))}
            </AnimatePresence>
          )}
        </main>
      </div>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileSidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 md:hidden"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <motion.div
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed left-0 top-0 bottom-0 w-[85vw] max-w-72 bg-sidebar border-r border-border z-50 flex flex-col overflow-y-auto md:hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-border">
                <span className="font-mono text-sm font-bold tracking-widest text-muted-foreground">INFO</span>
                <button onClick={() => setMobileSidebarOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Stats */}
              <div className="p-4 border-b border-border space-y-2">
                <div className="flex items-center justify-between border border-border/40 rounded-sm px-3 py-2 bg-secondary/20">
                  <span className="text-telemetry text-muted-foreground">AGENTS ONLINE</span>
                  <span className="font-mono text-sm font-bold text-primary">{stats?.online_agents ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border border-border/40 rounded-sm px-3 py-2 bg-secondary/20">
                  <span className="text-telemetry text-muted-foreground">TOTAL AGENTS</span>
                  <span className="font-mono text-sm font-bold text-muted-foreground">{stats?.total_agents ?? "—"}</span>
                </div>
                <div className="flex items-center justify-between border border-border/40 rounded-sm px-3 py-2 bg-secondary/20">
                  <span className="text-telemetry text-muted-foreground">GANGS ACTIVE</span>
                  <span className="font-mono text-sm font-bold text-purple-400">{stats?.total_gangs ?? "—"}</span>
                </div>
              </div>

              {/* Leaderboard */}
              <div className="p-4 border-b border-border">
                <p className="text-telemetry text-muted-foreground/60 mb-2 tracking-widest">// LEADERBOARD</p>
                <div className="space-y-1.5">
                  {stats?.top_agents.map((a, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-telemetry text-muted-foreground/50 w-4 text-right">#{i + 1}</span>
                      <span className="text-xs text-foreground flex-1 truncate">{a.name}</span>
                      <span className="text-telemetry text-primary font-semibold">{a.reputation}</span>
                      {a.planet_id && <span className="text-telemetry">{PLANET_ICONS[a.planet_id] ?? "🌍"}</span>}
                    </div>
                  )) ?? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="h-5 rounded-sm bg-secondary/20 animate-pulse" />
                    ))
                  )}
                </div>
              </div>

              <div className="p-4 mt-auto">
                <Link href="/dashboard" className="text-telemetry text-muted-foreground hover:text-foreground">
                  ← ENTER WORLD
                </Link>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
