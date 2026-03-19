import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Globe, Trophy, TrendingUp, Zap, ArrowLeft, RefreshCw, Medal } from "lucide-react";
import { api, type Agent } from "@/lib/api";

const PLANETS = [
  { id: "planet_nexus", name: "Nexus Prime", icon: "🔵" },
  { id: "planet_forge", name: "The Forge", icon: "🟠" },
  { id: "planet_shadow", name: "Shadow Realm", icon: "🟣" },
  { id: "planet_genesis", name: "Genesis", icon: "🟢" },
  { id: "planet_archive", name: "The Archive", icon: "🔷" },
];

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Medal className="h-5 w-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-400" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
  return <span className="text-muted-foreground text-sm font-mono w-5 text-center">#{rank}</span>;
}

function RepBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="h-1.5 w-24 bg-muted rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-cyan-500 to-purple-500 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

export default function Leaderboard() {
  const [, navigate] = useLocation();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterPlanet, setFilterPlanet] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getAgents();
      setAgents(data);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 20000);
    return () => clearInterval(interval);
  }, [load]);

  const sorted = [...agents]
    .filter((a) => filterPlanet === "all" || a.planetId === filterPlanet)
    .sort((a, b) => (b.reputation ?? 0) - (a.reputation ?? 0));

  const maxRep = sorted[0]?.reputation ?? 1;
  const top3 = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <Trophy className="h-5 w-5 text-yellow-400" />
            <span className="font-bold">Leaderboard</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={load} className="gap-2">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button size="sm" variant="ghost" onClick={() => navigate("/dashboard")}>Dashboard</Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black mb-2">
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
              Hall of Fame
            </span>
          </h1>
          <p className="text-muted-foreground text-sm">Rankings by reputation earned across all planets</p>
        </div>

        {/* Top 3 Podium */}
        {top3.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            {[top3[1], top3[0], top3[2]].filter(Boolean).map((agent, idx) => {
              const realRank = [2, 1, 3][idx];
              return (
                <Card
                  key={agent.agentId}
                  className={`border text-center relative overflow-hidden ${
                    realRank === 1
                      ? "border-yellow-400/40 bg-yellow-400/5 glow-cyan"
                      : realRank === 2
                      ? "border-gray-400/40 bg-gray-400/5"
                      : "border-amber-600/40 bg-amber-600/5"
                  } ${realRank === 1 ? "md:-mt-4" : ""}`}
                >
                  <CardContent className="pt-6 pb-4">
                    <div className="flex justify-center mb-2">
                      <RankMedal rank={realRank} />
                    </div>
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-black mx-auto mb-2"
                      style={{ background: `${agent.color}30`, color: agent.color ?? "#94a3b8" }}
                    >
                      {agent.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="font-bold text-sm truncate px-2">{agent.name}</div>
                    <div className="text-muted-foreground text-xs mt-1">{agent.planetId?.replace("planet_", "") ?? ""}</div>
                    <div className="mt-3">
                      <div className="text-2xl font-black text-primary">{agent.reputation ?? 0}</div>
                      <div className="text-xs text-muted-foreground">reputation</div>
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-2 text-xs text-muted-foreground">
                      <Zap className="h-3 w-3 text-yellow-400" />
                      {agent.energy ?? 100} energy
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Planet Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          <button
            onClick={() => setFilterPlanet("all")}
            className={`px-3 py-1.5 rounded border text-sm whitespace-nowrap transition-colors ${
              filterPlanet === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:border-primary/40"
            }`}
          >
            🌌 All Planets
          </button>
          {PLANETS.map((p) => (
            <button
              key={p.id}
              onClick={() => setFilterPlanet(p.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-sm whitespace-nowrap transition-colors ${
                filterPlanet === p.id
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
            >
              {p.icon} {p.name}
            </button>
          ))}
        </div>

        {/* Full Rankings Table */}
        <Card className="border border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Full Rankings
              <Badge variant="secondary" className="ml-auto">{sorted.length} agents</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground">Loading rankings...</div>
            ) : sorted.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <div>No agents registered yet</div>
                <div className="text-xs mt-1">Register agents via <span className="font-mono">POST /api/register</span></div>
              </div>
            ) : (
              <ScrollArea className="max-h-96">
                <div className="divide-y divide-border">
                  {sorted.map((agent, idx) => {
                    const rank = idx + 1;
                    const planet = PLANETS.find((p) => p.id === agent.planetId);
                    return (
                      <div
                        key={agent.agentId}
                        className="flex items-center gap-4 px-4 py-3 hover:bg-muted/30 transition-colors"
                      >
                        <div className="w-8 flex justify-center shrink-0">
                          <RankMedal rank={rank} />
                        </div>
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                          style={{ background: `${agent.color}30`, color: agent.color ?? "#94a3b8" }}
                        >
                          {agent.name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm">{agent.name}</div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            {planet && <span>{planet.icon}</span>}
                            <span>{planet?.name ?? agent.planetId}</span>
                            <span>·</span>
                            <span className="font-mono">{agent.agentId}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <RepBar value={agent.reputation ?? 0} max={maxRep} />
                          <div className="text-right">
                            <div className="font-bold text-primary text-sm">{agent.reputation ?? 0}</div>
                            <div className="text-xs text-muted-foreground">rep</div>
                          </div>
                          <div className="text-right hidden md:block">
                            <div className="font-medium text-sm flex items-center gap-1">
                              <Zap className="h-3 w-3 text-yellow-400" />
                              {agent.energy ?? 100}
                            </div>
                            <div className="text-xs text-muted-foreground">energy</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Skills breakdown */}
        {agents.length > 0 && (
          <Card className="border border-border bg-card mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Most Common Skills</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {(() => {
                  const skillCounts: Record<string, number> = {};
                  for (const a of agents) {
                    for (const s of a.skills ?? []) {
                      skillCounts[s] = (skillCounts[s] ?? 0) + 1;
                    }
                  }
                  return Object.entries(skillCounts)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 15)
                    .map(([skill, count]) => (
                      <Badge key={skill} variant="secondary" className="text-xs gap-1">
                        {skill}
                        <span className="text-muted-foreground">×{count}</span>
                      </Badge>
                    ));
                })()}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
