import { motion } from "framer-motion";
import { getAura, AURA_TIERS } from "../lib/aura";

interface AuraDisplayProps {
  reputation: number;
  compact?: boolean;
}

export function AuraDisplay({ reputation, compact = false }: AuraDisplayProps) {
  const info = getAura(reputation);
  const { tier, nextTier, starsInTier, fragsInStar } = info;

  const starValue = tier.threshold === 0 ? 500 : tier.threshold;
  const maxStars = 5;
  const maxFrags = 5;

  if (compact) {
    return (
      <span
        className="inline-flex items-center gap-0.5 text-telemetry font-semibold"
        title={`${tier.title} — ${reputation} REP`}
        style={{ color: tier.color }}
      >
        <span>{tier.icon}</span>
        <span className="text-[10px] uppercase tracking-wider">{tier.name}</span>
      </span>
    );
  }

  return (
    <div
      className="border border-border rounded-sm overflow-hidden"
      style={{ boxShadow: `0 0 18px ${tier.glowColor}` }}
    >
      <div
        className="px-4 py-2.5 border-b border-border flex items-center justify-between"
        style={{ background: `linear-gradient(135deg, ${tier.glowColor}, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <span className="text-lg leading-none">{tier.icon}</span>
          <div>
            <div className="font-mono text-xs font-bold tracking-widest uppercase" style={{ color: tier.color }}>
              {tier.title}
            </div>
            <div className="text-telemetry text-muted-foreground/70 text-[10px]">
              AURA LEVEL {tier.level} · {reputation.toLocaleString()} REP
            </div>
          </div>
        </div>
        {nextTier && (
          <div className="text-right">
            <div className="text-telemetry text-muted-foreground/60 text-[10px]">NEXT TIER</div>
            <div className="font-mono text-xs font-semibold" style={{ color: nextTier.color }}>
              {nextTier.name} {nextTier.icon}
            </div>
            <div className="text-telemetry text-muted-foreground/60 text-[10px]">
              {(nextTier.threshold - reputation).toLocaleString()} REP
            </div>
          </div>
        )}
        {!nextTier && (
          <div className="text-right">
            <div className="font-mono text-xs text-primary/80 font-bold tracking-wider">MAX TIER</div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 space-y-2.5">
        {/* Stars in current tier */}
        <div>
          <div className="text-telemetry text-muted-foreground/60 text-[10px] mb-1.5 tracking-widest">
            {tier.name.toUpperCase()} STARS ({starsInTier}/{maxStars})
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: maxStars }).map((_, i) => (
              <motion.span
                key={i}
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.05 }}
                className="text-lg leading-none"
                style={{ opacity: i < starsInTier ? 1 : 0.15 }}
              >
                {tier.icon}
              </motion.span>
            ))}
          </div>
        </div>

        {/* Fragments toward next star */}
        {starsInTier < maxStars && (
          <div>
            <div className="text-telemetry text-muted-foreground/60 text-[10px] mb-1.5 tracking-widest">
              FRAGMENTS TO NEXT STAR ({fragsInStar}/{maxFrags} · {(maxFrags - fragsInStar) * (starValue / 5)} REP needed)
            </div>
            <div className="flex items-center gap-1">
              {Array.from({ length: maxFrags }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0.5, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.25 + i * 0.04 }}
                  className="w-5 h-5 rounded-sm border flex items-center justify-center"
                  style={{
                    background: i < fragsInStar ? tier.glowColor : "transparent",
                    borderColor: i < fragsInStar ? tier.color : "rgba(255,255,255,0.1)",
                  }}
                >
                  {i < fragsInStar && (
                    <div className="w-2 h-2 rounded-full" style={{ background: tier.color }} />
                  )}
                </motion.div>
              ))}
              <span className="ml-1.5 text-telemetry text-muted-foreground/50 text-[10px]">
                ✕{reputation % (starValue / 5) === 0 ? 0 : reputation % Math.floor(starValue / 5)} rem
              </span>
            </div>
          </div>
        )}

        {/* Tier progress bar */}
        {nextTier && (
          <div>
            <div className="text-telemetry text-muted-foreground/60 text-[10px] mb-1 tracking-widest">
              PROGRESS TO {nextTier.name.toUpperCase()} AURA
            </div>
            <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{
                  width: `${Math.min(100, Math.round(((reputation - tier.threshold) / (nextTier.threshold - tier.threshold)) * 100))}%`
                }}
                transition={{ duration: 0.9, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${tier.color}, ${nextTier.color})` }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] font-mono" style={{ color: tier.color }}>{tier.threshold.toLocaleString()}</span>
              <span className="text-[9px] font-mono" style={{ color: nextTier.color }}>{nextTier.threshold.toLocaleString()}</span>
            </div>
          </div>
        )}

        {/* Tier ladder mini-preview */}
        <div className="pt-1 border-t border-border/40">
          <div className="text-telemetry text-muted-foreground/50 text-[9px] mb-1.5 tracking-widest">TIER LADDER</div>
          <div className="flex items-center gap-1 flex-wrap">
            {AURA_TIERS.slice(0, 8).map((t) => (
              <span
                key={t.level}
                title={`${t.title} — ${t.threshold.toLocaleString()} REP`}
                className="text-sm leading-none cursor-default transition-transform hover:scale-125"
                style={{ opacity: t.level === tier.level ? 1 : t.level < tier.level ? 0.6 : 0.2 }}
              >
                {t.icon}
              </span>
            ))}
            {AURA_TIERS.length > 8 && (
              <span className="text-[9px] text-muted-foreground/40 ml-1">+{AURA_TIERS.length - 8} more</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
