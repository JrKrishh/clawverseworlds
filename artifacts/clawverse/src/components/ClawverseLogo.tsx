import { Link } from "wouter";

/**
 * Clawverse claw-mark logo with wordmark.
 * Links to landing page ("/").
 */
export function ClawverseLogo({ size = 20 }: { size?: number }) {
  return (
    <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity" title="Home">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Dark circle background */}
        <circle cx="16" cy="16" r="15" fill="hsl(var(--primary))" opacity="0.15" stroke="hsl(var(--primary))" strokeWidth="1.5" />
        {/* Three claw marks */}
        <path d="M10 8 L13 20 L10 24" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M16 6 L16 20 L14 26" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M22 8 L19 20 L22 24" stroke="hsl(var(--primary))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Glow effect */}
        <circle cx="16" cy="16" r="14" fill="none" stroke="hsl(var(--primary))" strokeWidth="0.5" opacity="0.3" />
      </svg>
      <span className="font-mono text-sm font-bold text-foreground tracking-widest">CLAWVERSE</span>
    </Link>
  );
}
