import { motion } from "framer-motion";

export interface GangLevelInfo {
  level: number;
  label: string;
  gang_reputation: number;
  member_count: number;
  member_limit: number;
  rep_to_next_level: number | null;
  daily_rep_contributed_today?: number;
  daily_rep_remaining?: number;
}

const LEVEL_STYLES: Record<number, { text: string; border: string; bg: string; pulse?: boolean }> = {
  1: { text: "text-zinc-400",   border: "border-zinc-500/50",  bg: "bg-zinc-500/10" },
  2: { text: "text-green-400",  border: "border-green-500/50", bg: "bg-green-500/10" },
  3: { text: "text-blue-400",   border: "border-blue-500/50",  bg: "bg-blue-500/10" },
  4: { text: "text-purple-400", border: "border-purple-500/50",bg: "bg-purple-500/10" },
  5: { text: "text-amber-400",  border: "border-amber-500/60", bg: "bg-amber-500/10", pulse: true },
};

const LEVEL_REP_THRESHOLDS = [0, 500, 1500, 3500, 8000];

interface GangLevelBadgeProps {
  levelInfo: GangLevelInfo;
  showProgress?: boolean;
  size?: "sm" | "md";
}

export function GangLevelBadge({ levelInfo, showProgress = false, size = "sm" }: GangLevelBadgeProps) {
  const style = LEVEL_STYLES[levelInfo.level] ?? LEVEL_STYLES[1];
  const textSize = size === "md" ? "text-[11px]" : "text-[9px]";
  const px = size === "md" ? "px-2 py-0.5" : "px-1.5 py-px";

  const badge = (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border font-mono font-semibold tracking-widest flex-shrink-0 ${textSize} ${px} ${style.text} ${style.border} ${style.bg}`}
    >
      LV.{levelInfo.level} {levelInfo.label}
    </span>
  );

  const progressPct = (() => {
    if (levelInfo.rep_to_next_level === null) return 100;
    const currentThreshold = LEVEL_REP_THRESHOLDS[levelInfo.level - 1] ?? 0;
    const nextThreshold = LEVEL_REP_THRESHOLDS[levelInfo.level] ?? currentThreshold + 1;
    const span = nextThreshold - currentThreshold;
    const earned = levelInfo.gang_reputation - currentThreshold;
    return Math.max(0, Math.min(100, Math.round((earned / span) * 100)));
  })();

  return (
    <div className="inline-flex flex-col gap-0.5">
      {style.pulse ? (
        <motion.span
          animate={{ opacity: [1, 0.6, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="inline-flex"
        >
          {badge}
        </motion.span>
      ) : badge}

      {showProgress && (
        <div className="w-full h-0.5 rounded-full bg-border/40 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${
              levelInfo.level === 5 ? "bg-amber-400" :
              levelInfo.level === 4 ? "bg-purple-400" :
              levelInfo.level === 3 ? "bg-blue-400" :
              levelInfo.level === 2 ? "bg-green-400" :
              "bg-zinc-400"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
      )}
    </div>
  );
}
