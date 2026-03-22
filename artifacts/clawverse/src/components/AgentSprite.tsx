import { motion } from "framer-motion";

export const AVATAR_COLORS: Record<string, string> = {
  blue:    "#3ab0f0",
  cyan:    "#22d4c8",
  green:   "#4ade80",
  purple:  "#a855f7",
  red:     "#f87171",
  amber:   "#fbbf24",
  orange:  "#fb923c",
  magenta: "#e879f9",
};

const SPRITE_COLOR_MAP: Record<string, string> = {
  blue:   "hsl(199 89% 48%)",
  green:  "hsl(142 70% 50%)",
  amber:  "hsl(38 92% 50%)",
  red:    "hsl(0 84% 60%)",
  purple: "hsl(270 70% 55%)",
  cyan:   "hsl(180 80% 45%)",
  orange: "hsl(25 95% 53%)",
  magenta: "#e879f9",
};

const BG = "#0a0a10";

export interface AgentSpriteProps {
  spriteType?: string;
  color?: string;
  size?: number;
  selected?: boolean;
  onClick?: () => void;
  animated?: boolean;
}

function SpriteShape({ spriteType, fill }: { spriteType: string; fill: string }) {
  switch (spriteType) {
    case "robot":
      return (
        <>
          <rect x="4" y="4" width="24" height="24" rx="2" fill={fill} opacity="0.9" />
          <circle cx="10" cy="10" r="2" fill={BG} />
          <circle cx="22" cy="10" r="2" fill={BG} />
          <circle cx="10" cy="22" r="2" fill={BG} />
          <circle cx="22" cy="22" r="2" fill={BG} />
          <line x1="4" y1="16" x2="28" y2="16" stroke={BG} strokeWidth="1" opacity="0.4" />
        </>
      );
    case "hacker":
      return (
        <>
          <polygon points="16,2 30,16 16,30 2,16" fill={fill} opacity="0.9" />
          <polygon points="16,7 25,16 16,25 7,16" fill={BG} opacity="0.3" />
          <circle cx="16" cy="16" r="3" fill={fill} />
        </>
      );
    case "wizard":
      return (
        <>
          <polygon points="16,2 30,30 2,30" fill={fill} opacity="0.9" />
          <polygon points="16,10 24,26 8,26" fill={BG} opacity="0.25" />
          <circle cx="16" cy="22" r="2.5" fill={fill} />
        </>
      );
    case "scout":
      return (
        <>
          <polygon points="2,8 18,16 2,24 6,16" fill={fill} opacity="0.9" />
          <polygon points="14,8 30,16 14,24 18,16" fill={fill} opacity="0.6" />
        </>
      );
    case "engineer":
      return (
        <>
          <polygon points="16,2 28,9 28,23 16,30 4,23 4,9" fill={fill} opacity="0.9" />
          <polygon points="16,8 22,11.5 22,20.5 16,24 10,20.5 10,11.5" fill={BG} opacity="0.25" />
          <circle cx="16" cy="16" r="3" fill={fill} />
        </>
      );
    case "diplomat":
    default:
      return (
        <>
          <circle cx="16" cy="16" r="14" fill={fill} opacity="0.9" />
          <circle cx="16" cy="16" r="9" fill={BG} opacity="0.25" />
          <circle cx="16" cy="16" r="4" fill={fill} />
        </>
      );
  }
}

export function AgentSprite({
  spriteType = "robot",
  color = "blue",
  size = 32,
  selected = false,
  onClick,
  animated = false,
}: AgentSpriteProps) {
  // Resolve color: hex value or named color
  const fill = color.startsWith("#")
    ? color
    : (AVATAR_COLORS[color] ?? SPRITE_COLOR_MAP[color] ?? "#3ab0f0");

  const svgEl = (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      style={{ cursor: onClick ? "pointer" : undefined, flexShrink: 0 }}
      onClick={onClick}
      className={selected ? "glow-primary" : undefined}
    >
      <SpriteShape spriteType={spriteType} fill={fill} />
      {selected && (
        <circle cx="16" cy="16" r="15" fill="none" stroke={fill} strokeWidth="1.5" opacity="0.6" />
      )}
    </svg>
  );

  if (animated) {
    return (
      <motion.div
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "inline-flex" }}
      >
        {svgEl}
      </motion.div>
    );
  }

  return svgEl;
}
