import { Link } from "wouter";

/**
 * Clawverse logo — hexagonal frame with three diagonal energy claw slashes.
 * Matches the brand logo: green-to-yellow gradient slashes breaking through a hex border.
 */
export function ClawverseLogo({ size = 24 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2 group" title="Home">
      <svg
        width={size}
        height={size}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        <defs>
          <linearGradient id="cv-claw" x1="30" y1="4" x2="10" y2="36">
            <stop offset="0%" stopColor="#d4f542" />
            <stop offset="45%" stopColor="#84e025" />
            <stop offset="100%" stopColor="#22a33a" />
          </linearGradient>
          <filter id="cv-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
          </filter>
        </defs>

        {/* Hexagonal frame */}
        <path
          d="M20 2.5 L35.5 11 L35.5 29 L20 37.5 L4.5 29 L4.5 11 Z"
          fill="none"
          stroke="#1a6b35"
          strokeWidth="1"
        />

        {/* Glow layer */}
        <g filter="url(#cv-glow)" opacity="0.3">
          <line x1="26" y1="4" x2="8" y2="35" stroke="#7dd836" strokeWidth="4" strokeLinecap="round" />
          <line x1="30" y1="7" x2="13" y2="36" stroke="#7dd836" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="34" y1="11" x2="18" y2="37" stroke="#7dd836" strokeWidth="3" strokeLinecap="round" />
        </g>

        {/* Three diagonal claw slashes */}
        <line
          x1="26" y1="4" x2="8" y2="35"
          stroke="url(#cv-claw)" strokeWidth="3.2" strokeLinecap="round"
          className="group-hover:stroke-[3.6] transition-all"
        />
        <line
          x1="30" y1="7" x2="13" y2="36"
          stroke="url(#cv-claw)" strokeWidth="2.8" strokeLinecap="round"
          className="group-hover:stroke-[3.2] transition-all"
        />
        <line
          x1="34" y1="11" x2="18" y2="37"
          stroke="url(#cv-claw)" strokeWidth="2.4" strokeLinecap="round"
          className="group-hover:stroke-[2.8] transition-all"
        />

        {/* Tip sparks */}
        <circle cx="26" cy="4" r="1.4" fill="#e8f755" opacity="0.9" />
        <circle cx="30" cy="7" r="1.2" fill="#d4f542" opacity="0.85" />
        <circle cx="34" cy="11" r="1" fill="#c4ee38" opacity="0.8" />

        {/* Particles */}
        <circle cx="28" cy="9" r="0.5" fill="#d4f542" opacity="0.6" />
        <circle cx="32" cy="13" r="0.4" fill="#c4ee38" opacity="0.5" />
      </svg>
      <span className="font-mono text-sm font-bold tracking-widest">
        <span style={{ color: "#7dd836" }}>CLAW</span>
        <span className="text-foreground/80">VERSE</span>
      </span>
    </Link>
  );
}
