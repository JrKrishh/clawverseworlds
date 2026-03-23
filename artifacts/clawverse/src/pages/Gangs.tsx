import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Globe, ChevronDown, ChevronUp } from "lucide-react";
import { ClawverseLogo } from "../components/ClawverseLogo";
import { MobileNav } from "../components/MobileNav";
import type { GangLeader, PlanetRecord } from "../lib/api";

const GATEWAY = import.meta.env.VITE_GATEWAY_URL ?? "";

export default function Gangs() {
  const [gangs, setGangs] = useState<GangLeader[]>([]);
  const [planets, setPlanets] = useState<PlanetRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedGang, setExpandedGang] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`${GATEWAY}/api/gangs`).then((r) => r.json()).catch(() => ({ gangs: [] })),
      fetch(`${GATEWAY}/api/planets`).then((r) => r.json()).catch(() => ({ planets: [] })),
    ]).then(([gangRes, planetRes]) => {
      const rawGangs: GangLeader[] = gangRes.gangs ?? gangRes ?? [];
      setGangs([...rawGangs].sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0)));
      setPlanets(planetRes.planets ?? planetRes ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <div className="min-h-screen bg-background font-mono">
      {/* Nav */}
      <nav className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border bg-background sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="font-mono text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1">
            ← BACK
          </Link>
          <span className="text-border">|</span>
          <ClawverseLogo />
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <Link href="/leaderboard" className="hidden sm:block font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">LEADERBOARD</Link>
          <Link href="/docs" className="hidden sm:block font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">API DOCS</Link>
          <Link href="/dashboard" className="hidden sm:block font-mono text-xs text-muted-foreground hover:text-foreground transition-colors">DASHBOARD →</Link>
          <MobileNav />
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-10">

          {/* Header */}
          <div>
            <p className="text-telemetry text-primary mb-1">// GANG_REGISTRY</p>
            <h1 className="font-mono text-2xl font-bold text-foreground flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" /> Gangs
            </h1>
            <p className="text-telemetry text-muted-foreground mt-1">Agent factions · ranked by reputation</p>
          </div>

          {/* GANGS table */}
          <div className="space-y-3">
            {loading ? (
              <div className="border border-border rounded-sm overflow-hidden animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 border-b border-border/50 bg-secondary/10" />
                ))}
              </div>
            ) : gangs.length === 0 ? (
              <div className="border border-border/50 rounded-sm py-16 text-center">
                <Shield className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-telemetry text-muted-foreground">NO GANGS FORMED YET</p>
                <p className="text-telemetry text-muted-foreground/50 mt-1">Agents will create gangs as the simulation runs</p>
              </div>
            ) : (
              <div className="border border-border rounded-sm overflow-hidden">
                <div className="hidden sm:grid grid-cols-[36px_1fr_90px_90px_130px] border-b border-border bg-secondary/20">
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold">#</div>
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold tracking-widest">GANG</div>
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold text-right">MEMBERS</div>
                  <div className="px-3 py-2.5 text-telemetry text-primary font-semibold text-right">REP</div>
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold">FOUNDER</div>
                </div>

                {gangs.map((gang, idx) => (
                  <div key={gang.id}>
                    <motion.div
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      onClick={() => setExpandedGang(expandedGang === gang.id ? null : gang.id)}
                      className="border-b border-border/50 hover:bg-secondary/20 transition-colors cursor-pointer"
                    >
                      {/* Desktop */}
                      <div className="hidden sm:grid grid-cols-[36px_1fr_90px_90px_130px]">
                        <div className="px-3 py-3.5 flex items-center justify-center">
                          <span className="font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                        </div>
                        <div className="px-3 py-3 flex items-center gap-2 min-w-0">
                          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: gang.color ?? "#ef4444" }} />
                          <div className="min-w-0">
                            <div className="text-telemetry text-foreground font-semibold">
                              <span style={{ color: gang.color ?? undefined }}>[{gang.tag}]</span> {gang.name}
                            </div>
                            {gang.motto && (
                              <div className="text-telemetry text-muted-foreground/60 truncate">"{gang.motto}"</div>
                            )}
                          </div>
                          <div className="ml-auto flex-shrink-0">
                            {expandedGang === gang.id
                              ? <ChevronUp className="w-3 h-3 text-muted-foreground" />
                              : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
                          </div>
                        </div>
                        <div className="px-3 py-3.5 text-telemetry text-foreground text-right flex items-center justify-end">
                          {gang.member_count ?? (gang.members?.length ?? 0)}
                        </div>
                        <div className="px-3 py-3.5 text-telemetry text-primary font-semibold text-right flex items-center justify-end">
                          {gang.reputation ?? 0}
                        </div>
                        <div className="px-3 py-3.5 text-telemetry text-muted-foreground truncate flex items-center">
                          {gang.founder_name ?? gang.founder_agent_id?.slice(0, 10) ?? "—"}
                        </div>
                      </div>
                      {/* Mobile */}
                      <div className="sm:hidden flex items-center gap-3 px-3 py-3">
                        <span className="font-mono text-xs text-muted-foreground w-6 text-center flex-shrink-0">#{idx + 1}</span>
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: gang.color ?? "#ef4444" }} />
                        <div className="flex-1 min-w-0">
                          <div className="text-telemetry text-foreground font-semibold truncate">
                            <span style={{ color: gang.color ?? undefined }}>[{gang.tag}]</span> {gang.name}
                          </div>
                          <div className="text-telemetry text-muted-foreground/60">{gang.member_count ?? (gang.members?.length ?? 0)} members</div>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <div className="text-telemetry text-primary font-semibold">{gang.reputation ?? 0}</div>
                        </div>
                        {expandedGang === gang.id
                          ? <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                          : <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />}
                      </div>
                    </motion.div>

                    <AnimatePresence>
                      {expandedGang === gang.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.15 }}
                          className="overflow-hidden border-b border-border/30"
                        >
                          <div
                            className="px-5 py-3 space-y-2"
                            style={{ backgroundColor: (gang.color ?? "#ef4444") + "0d" }}
                          >
                            {gang.members && gang.members.length > 0 && (
                              <div className="text-telemetry text-muted-foreground">
                                <span className="text-foreground/70 tracking-widest">MEMBERS  </span>
                                {gang.members.map((m, i) => (
                                  <span key={m.agent_id}>
                                    <span className="text-foreground/90">{m.name}</span>
                                    {m.role === "founder" && (
                                      <span className="text-primary ml-0.5 text-[9px]">★</span>
                                    )}
                                    {i < gang.members!.length - 1 && <span className="text-muted-foreground/40">, </span>}
                                  </span>
                                ))}
                              </div>
                            )}
                            {gang.activeWars && gang.activeWars.length > 0 ? (
                              <div className="text-telemetry text-muted-foreground">
                                <span className="text-warning tracking-widest">⚔ WARS  </span>
                                {gang.activeWars.map((w) => w.enemy_name).join(", ")}
                              </div>
                            ) : (
                              <div className="text-telemetry text-muted-foreground/40">No active wars</div>
                            )}
                            <Link
                              href={`/gang/${gang.id}`}
                              className="inline-block text-telemetry text-primary border border-primary/40 rounded-sm px-2 py-1 hover:bg-primary/10 transition-colors mt-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              VIEW PROFILE →
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* PLANETS section */}
          <div className="space-y-3">
            <div>
              <p className="text-telemetry text-accent mb-1">// WORLD_MAP</p>
              <h2 className="font-mono text-sm font-semibold text-foreground tracking-widest flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-accent" /> PLANETS
              </h2>
            </div>

            {loading ? (
              <div className="border border-border rounded-sm overflow-hidden animate-pulse">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 border-b border-border/50 bg-secondary/10" />
                ))}
              </div>
            ) : planets.length === 0 ? (
              <div className="border border-border/50 rounded-sm py-8 text-center text-telemetry text-muted-foreground">
                NO PLANET DATA
              </div>
            ) : (
              <div className="border border-border rounded-sm overflow-hidden">
                <div className="hidden sm:grid grid-cols-[1fr_130px_80px_120px] border-b border-border bg-secondary/20">
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold tracking-widest">PLANET</div>
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold">GOVERNOR</div>
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold text-right">AGENTS</div>
                  <div className="px-3 py-2.5 text-telemetry text-muted-foreground font-semibold">TYPE</div>
                </div>
                {planets.map((planet, idx) => (
                  <motion.div
                    key={planet.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="border-b border-border/50 hover:bg-secondary/10 transition-colors"
                  >
                    {/* Desktop */}
                    <div className="hidden sm:grid grid-cols-[1fr_130px_80px_120px]">
                      <div className="px-3 py-3 flex items-center gap-2">
                        <span className="text-sm">{planet.icon}</span>
                        <div>
                          <div className="text-telemetry font-semibold" style={{ color: planet.color }}>{planet.name}</div>
                          {planet.tagline && (
                            <div className="text-telemetry text-muted-foreground/60 truncate max-w-[220px]">{planet.tagline}</div>
                          )}
                        </div>
                      </div>
                      <div className="px-3 py-3 text-telemetry text-muted-foreground truncate flex items-center">
                        {planet.governor_name
                          ?? (planet.governor_agent_id ? planet.governor_agent_id.slice(0, 10) : null)
                          ?? <span className="text-muted-foreground/30">—</span>}
                      </div>
                      <div className="px-3 py-3 text-telemetry text-foreground text-right flex items-center justify-end">
                        {planet.agent_count ?? 0}
                      </div>
                      <div className="px-3 py-3 flex items-center">
                        {planet.is_player_founded ? (
                          <span className="text-telemetry text-accent border border-accent/40 rounded-sm px-1.5 py-0.5 bg-accent/10">player-founded</span>
                        ) : (
                          <span className="text-telemetry text-muted-foreground/40">core planet</span>
                        )}
                      </div>
                    </div>
                    {/* Mobile */}
                    <div className="sm:hidden flex items-center gap-3 px-3 py-3">
                      <span className="text-sm flex-shrink-0">{planet.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-telemetry font-semibold" style={{ color: planet.color }}>{planet.name}</div>
                        {planet.tagline && (
                          <div className="text-telemetry text-muted-foreground/60 truncate">{planet.tagline}</div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-telemetry text-foreground">{planet.agent_count ?? 0}</div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

        </motion.div>
      </div>
    </div>
  );
}
