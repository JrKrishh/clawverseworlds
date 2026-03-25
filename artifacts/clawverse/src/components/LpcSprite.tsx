import { useEffect, useRef, useMemo } from "react";
import { motion } from "framer-motion";
import type { LpcAppearance } from "../lib/lpcCatalog";

interface LpcSpriteProps {
  appearance: LpcAppearance;
  size?: number;
  animation?: "idle" | "walk" | "attack";
  animated?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

// ── Color palettes derived from appearance variant names ─────────────────────

const SKIN_COLORS: Record<string, string> = {
  light: "#FFDCB1", amber: "#E8B878", olive: "#C4A265", taupe: "#B08968",
  bronze: "#CD853F", brown: "#8B5E3C", black: "#4A3728", lavender: "#C8A2C8",
  blue: "#6B8CBA", green: "#6B8E6B", zombie_green: "#7B9B5B",
};

const HAIR_COLORS: Record<string, string> = {
  black: "#1A1A2E", blonde: "#F0D58C", brown: "#6B4226", brunette: "#4A2F1A",
  dark_blonde: "#C4A35A", gray: "#8E8E8E", green: "#2ECC71", light_blonde: "#F5E6B8",
  pink: "#FF69B4", purple: "#8E44AD", redhead: "#C0392B", redhead2: "#E74C3C",
  ruby_red: "#9B111E", white: "#E8E8E8",
};

const FABRIC_COLORS: Record<string, string> = {
  black: "#1A1A2E", blue: "#3498DB", brown: "#6B4226", forest: "#228B22",
  gray: "#7F8C8D", green: "#27AE60", lavender: "#B57EDC", maroon: "#800000",
  navy: "#1B2838", orange: "#E67E22", pink: "#FF69B4", purple: "#8E44AD",
  red: "#E74C3C", sky: "#87CEEB", tan: "#D2B48C", teal: "#008080",
  white: "#ECF0F1", yellow: "#F1C40F", charcoal: "#36454F",
};

const METAL_COLORS: Record<string, string> = {
  brass: "#B5A642", bronze: "#CD7F32", ceramic: "#E8DCC8", copper: "#B87333",
  gold: "#FFD700", iron: "#696969", silver: "#C0C0C0", steel: "#71797E",
};

const SHOE_COLORS: Record<string, string> = {
  ...FABRIC_COLORS,
  ...METAL_COLORS,
};

function getColor(variant: string, palette: Record<string, string>, fallback = "#888"): string {
  return palette[variant] ?? FABRIC_COLORS[variant] ?? METAL_COLORS[variant] ?? fallback;
}

// ── Pixel character drawing ──────────────────────────────────────────────────

interface CharColors {
  skin: string;
  hair: string;
  eyes: string;
  torso: string;
  legs: string;
  feet: string;
  cape: string | null;
  hat: string | null;
  gloves: string | null;
  shoulders: string | null;
}

function extractColors(appearance: LpcAppearance): CharColors {
  const l = appearance.layers;
  return {
    skin: getColor(l.body?.variant ?? "light", SKIN_COLORS, "#FFDCB1"),
    hair: getColor(l.hair?.variant ?? "brown", HAIR_COLORS, "#6B4226"),
    eyes: getColor(l.eyes?.variant ?? "blue", { blue: "#3498DB", brown: "#6B4226", green: "#27AE60", gray: "#7F8C8D", red: "#E74C3C", purple: "#8E44AD", orange: "#E67E22" }, "#3498DB"),
    torso: getColor(l.torso?.variant ?? "blue", { ...FABRIC_COLORS, ...METAL_COLORS }, "#3498DB"),
    legs: getColor(l.legs?.variant ?? "navy", { ...FABRIC_COLORS, ...METAL_COLORS }, "#1B2838"),
    feet: getColor(l.feet?.variant ?? "brown", SHOE_COLORS, "#6B4226"),
    cape: l.cape ? getColor(l.cape.variant, FABRIC_COLORS) : null,
    hat: l.hat ? getColor(l.hat.variant, { ...FABRIC_COLORS, ...METAL_COLORS }) : null,
    gloves: l.gloves ? getColor(l.gloves.variant, { ...FABRIC_COLORS, ...METAL_COLORS }) : null,
    shoulders: l.shoulders ? getColor(l.shoulders.variant, { ...FABRIC_COLORS, ...METAL_COLORS }) : null,
  };
}

function darker(hex: string, amount = 0.2): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `#${Math.round(r * f).toString(16).padStart(2, "0")}${Math.round(g * f).toString(16).padStart(2, "0")}${Math.round(b * f).toString(16).padStart(2, "0")}`;
}

function lighter(hex: string, amount = 0.3): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `#${Math.min(255, Math.round(r + (255 - r) * amount)).toString(16).padStart(2, "0")}${Math.min(255, Math.round(g + (255 - g) * amount)).toString(16).padStart(2, "0")}${Math.min(255, Math.round(b + (255 - b) * amount)).toString(16).padStart(2, "0")}`;
}

// Draw a pixel character on a 16x16 grid (scaled up to canvas size)
function drawCharacter(ctx: CanvasRenderingContext2D, size: number, colors: CharColors, frame: number, isFemale: boolean) {
  const px = size / 16;
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = false;

  function rect(x: number, y: number, w: number, h: number, color: string) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x * px), Math.round(y * px), Math.round(w * px), Math.round(h * px));
  }

  const bounce = frame % 2 === 1 ? -0.5 : 0;

  // Cape (behind body)
  if (colors.cape) {
    rect(4, 4 + bounce, 8, 9, colors.cape);
    rect(3, 6 + bounce, 1, 6, colors.cape);
    rect(12, 6 + bounce, 1, 6, colors.cape);
    rect(4, 13 + bounce, 8, 1, darker(colors.cape));
  }

  // Feet / shoes
  rect(5, 14 + bounce, 2, 1, colors.feet);
  rect(9, 14 + bounce, 2, 1, colors.feet);
  // Walk animation: offset feet
  if (frame % 4 === 1) {
    rect(4, 14, 2, 1, colors.feet);
    rect(10, 14, 2, 1, colors.feet);
  } else if (frame % 4 === 3) {
    rect(6, 14, 2, 1, colors.feet);
    rect(8, 14, 2, 1, colors.feet);
  } else {
    rect(5, 14 + bounce, 2, 1, colors.feet);
    rect(9, 14 + bounce, 2, 1, colors.feet);
  }

  // Legs
  rect(5, 12 + bounce, 2, 2, colors.legs);
  rect(9, 12 + bounce, 2, 2, colors.legs);
  // Connecting piece (skirt for female)
  if (isFemale) {
    rect(5, 10 + bounce, 6, 3, colors.legs);
    rect(4, 11 + bounce, 1, 2, lighter(colors.legs));
    rect(11, 11 + bounce, 1, 2, lighter(colors.legs));
  } else {
    rect(7, 12 + bounce, 2, 2, darker(colors.legs, 0.1));
  }

  // Torso / shirt
  rect(5, 6 + bounce, 6, 4, colors.torso);
  rect(4, 7 + bounce, 1, 3, colors.torso); // left sleeve
  rect(11, 7 + bounce, 1, 3, colors.torso); // right sleeve

  // Shoulders
  if (colors.shoulders) {
    rect(4, 6 + bounce, 2, 2, colors.shoulders);
    rect(10, 6 + bounce, 2, 2, colors.shoulders);
    rect(4, 6 + bounce, 8, 1, darker(colors.shoulders, 0.1));
  }

  // Arms (skin)
  rect(4, 10 + bounce, 1, 2, colors.skin);
  rect(11, 10 + bounce, 1, 2, colors.skin);

  // Gloves
  if (colors.gloves) {
    rect(4, 10 + bounce, 1, 2, colors.gloves);
    rect(11, 10 + bounce, 1, 2, colors.gloves);
  }

  // Neck
  rect(7, 5 + bounce, 2, 2, colors.skin);

  // Head
  rect(5, 1 + bounce, 6, 5, colors.skin);
  // Face details
  rect(6, 3 + bounce, 1, 1, colors.eyes); // left eye
  rect(9, 3 + bounce, 1, 1, colors.eyes); // right eye
  rect(7, 4 + bounce, 2, 0.5, darker(colors.skin, 0.15)); // mouth line

  // Hair — top of head
  rect(5, 0 + bounce, 6, 2, colors.hair);
  // Side hair
  rect(4, 1 + bounce, 1, 4, colors.hair);
  rect(11, 1 + bounce, 1, 4, colors.hair);
  // Long hair for ponytail/braids/long styles
  if (isFemale) {
    rect(4, 5 + bounce, 1, 4, colors.hair);
    rect(11, 5 + bounce, 1, 4, colors.hair);
  }

  // Hat
  if (colors.hat) {
    rect(4, 0 + bounce, 8, 2, colors.hat);
    rect(3, 1 + bounce, 10, 1, colors.hat);
    // Brim highlight
    rect(4, 0 + bounce, 8, 1, lighter(colors.hat, 0.2));
  }

  // Outline (subtle)
  ctx.globalAlpha = 0.15;
  ctx.strokeStyle = "#000";
  ctx.lineWidth = px * 0.4;
  ctx.strokeRect(5 * px, (1 + bounce) * px, 6 * px, 13 * px);
  ctx.globalAlpha = 1;
}

// ── Component ────────────────────────────────────────────────────────────────

export function LpcSprite({
  appearance,
  size = 48,
  animation = "idle",
  animated = true,
  selected = false,
  onClick,
}: LpcSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const colors = useMemo(() => extractColors(appearance), [appearance]);
  const isFemale = appearance.charType === "female";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = 0;
    const fps = animation === "idle" ? 2 : 6;
    const interval = 1000 / fps;

    function draw() {
      drawCharacter(ctx!, size, colors, animation === "idle" ? 0 : frameRef.current, isFemale);
    }

    function loop(time: number) {
      if (time - lastTime >= interval) {
        lastTime = time;
        if (animation !== "idle") {
          frameRef.current = (frameRef.current + 1) % 4;
        }
        draw();
      }
      animId = requestAnimationFrame(loop);
    }

    // Draw immediately
    draw();
    if (animated) animId = requestAnimationFrame(loop);

    return () => { if (animId) cancelAnimationFrame(animId); };
  }, [colors, animated, size, animation, isFemale]);

  const canvas = (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : undefined,
        imageRendering: "pixelated",
        border: selected ? "2px solid #a855f7" : "2px solid transparent",
        borderRadius: 4,
      }}
    />
  );

  if (animated && animation !== "idle") {
    return (
      <motion.div
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "inline-flex" }}
      >
        {canvas}
      </motion.div>
    );
  }

  return canvas;
}
