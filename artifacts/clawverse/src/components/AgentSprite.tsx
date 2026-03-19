const SPRITE_COLORS: Record<string, string> = {
  blue:   "hsl(199 89% 48%)",
  green:  "hsl(142 70% 50%)",
  amber:  "hsl(38 92% 50%)",
  red:    "hsl(0 84% 60%)",
  purple: "hsl(270 70% 55%)",
  cyan:   "hsl(180 80% 45%)",
  orange: "hsl(25 95% 53%)",
};

interface AgentSpriteProps {
  spriteType?: string;
  color?: string;
  size?: number;
}

export function AgentSprite({ spriteType = "robot", color = "blue", size = 36 }: AgentSpriteProps) {
  const fill = SPRITE_COLORS[color] ?? SPRITE_COLORS.blue;
  const stroke = fill;
  const dim = size;
  const cx = dim / 2;
  const cy = dim / 2;
  const r = dim * 0.35;

  const glowId = `glow-${color}-${spriteType}`;

  switch (spriteType) {
    case "robot": {
      const pad = dim * 0.15;
      const bw = dim - pad * 2;
      const bh = dim - pad * 2;
      return (
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} fill="none">
          <defs>
            <filter id={glowId}>
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" />
            </filter>
          </defs>
          <rect x={pad} y={pad} width={bw} height={bh} rx={2} fill={fill} opacity={0.85} filter={`url(#${glowId})`} />
          <line x1={pad + 4} y1={pad + 4} x2={pad + 4} y2={pad + bh - 4} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
          <line x1={pad + 4} y1={cy} x2={pad + bw - 4} y2={cy} stroke="rgba(0,0,0,0.3)" strokeWidth={1} />
          <circle cx={cx - 4} cy={cy - 4} r={2} fill="rgba(0,0,0,0.5)" />
          <circle cx={cx + 4} cy={cy - 4} r={2} fill="rgba(0,0,0,0.5)" />
        </svg>
      );
    }
    case "hacker": {
      const half = r * 1.1;
      const pts = `${cx},${cy - half} ${cx + half},${cy} ${cx},${cy + half} ${cx - half},${cy}`;
      return (
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} fill="none">
          <polygon points={pts} fill={fill} opacity={0.85} />
          <polygon points={pts} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        </svg>
      );
    }
    case "wizard": {
      const h = r * 2.2;
      const pts = `${cx},${cy - h / 2} ${cx + h * 0.6},${cy + h / 2} ${cx - h * 0.6},${cy + h / 2}`;
      return (
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} fill="none">
          <polygon points={pts} fill={fill} opacity={0.85} />
          <polygon points={pts} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        </svg>
      );
    }
    case "scout": {
      const pts = `${cx},${cy - r} ${cx + r * 0.7},${cy + r * 0.5} ${cx},${cy + r * 0.1} ${cx - r * 0.7},${cy + r * 0.5}`;
      return (
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} fill="none">
          <polygon points={pts} fill={fill} opacity={0.85} />
        </svg>
      );
    }
    case "engineer": {
      const angles = [0, 60, 120, 180, 240, 300].map(a => (a * Math.PI) / 180);
      const pts = angles.map(a => `${cx + r * Math.cos(a - Math.PI / 2)},${cy + r * Math.sin(a - Math.PI / 2)}`).join(" ");
      return (
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} fill="none">
          <polygon points={pts} fill={fill} opacity={0.85} />
          <polygon points={pts} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        </svg>
      );
    }
    case "diplomat":
    default: {
      return (
        <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} fill="none">
          <circle cx={cx} cy={cy} r={r} fill={fill} opacity={0.85} />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
          <circle cx={cx} cy={cy} r={r * 0.4} fill="rgba(0,0,0,0.2)" />
        </svg>
      );
    }
  }
}
