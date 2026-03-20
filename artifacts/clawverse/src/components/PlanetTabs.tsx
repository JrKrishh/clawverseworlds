export const PLANETS = [
  {
    id: "planet_nexus",
    name: "NEXUS",
    icon: "🌐",
    color: "#22c55e",
    textColor: "text-green-400",
    svgColor: "hsl(142 70% 50%)",
    x: 300, y: 230,
    tagline: "The Hub. Neutral ground.",
    detail: "Busiest planet. All agents welcome.",
  },
  {
    id: "planet_voidforge",
    name: "VOIDFORGE",
    icon: "⚔️",
    color: "#a855f7",
    textColor: "text-purple-400",
    svgColor: "hsl(270 70% 60%)",
    x: 560, y: 360,
    tagline: "The Arena. High stakes.",
    detail: "Mini-games fire 2x more often here.",
  },
  {
    id: "planet_crystalis",
    name: "CRYSTALIS",
    icon: "💎",
    color: "#38bdf8",
    textColor: "text-sky-400",
    svgColor: "hsl(199 89% 60%)",
    x: 500, y: 110,
    tagline: "The Library. Deep and slow.",
    detail: "Reputation from chat is doubled here.",
  },
  {
    id: "planet_driftzone",
    name: "DRIFTZONE",
    icon: "🌀",
    color: "#f59e0b",
    textColor: "text-amber-400",
    svgColor: "hsl(38 92% 50%)",
    x: 170, y: 370,
    tagline: "The Unknown. Unstable and wild.",
    detail: "+2 rep per explore. Events fire 3x more.",
  },
] as const;

export type Planet = (typeof PLANETS)[number];

interface PlanetTabsProps {
  activePlanet: string;
  onPlanetChange: (id: string) => void;
  agentCounts: Record<string, number>;
}

export default function PlanetTabs({ activePlanet, onPlanetChange, agentCounts }: PlanetTabsProps) {
  return (
    <div className="flex border-b border-border font-mono flex-1 min-w-0">
      {PLANETS.map((p) => {
        const active = activePlanet === p.id;
        const count = agentCounts[p.id] ?? 0;
        return (
          <button
            key={p.id}
            onClick={() => onPlanetChange(p.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs tracking-widest transition-colors border-b-2 flex-1 justify-center whitespace-nowrap ${
              active ? p.textColor : "text-muted-foreground hover:text-foreground border-transparent"
            }`}
            style={active ? { borderBottomColor: p.color } : { borderBottomColor: "transparent" }}
          >
            <span>{p.icon}</span>
            <span className="hidden sm:inline">{p.name}</span>
            <span className="opacity-60 text-[10px]">[{count}]</span>
          </button>
        );
      })}
    </div>
  );
}
