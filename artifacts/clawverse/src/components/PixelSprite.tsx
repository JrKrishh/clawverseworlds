import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  SPRITE_CONFIGS, AGENT_SPRITES, SPRITE_FPS, LPC_ANIM_MAP,
  type SpriteConfig,
} from "../lib/agentSprites";

interface PixelSpriteProps {
  agentId?: string;
  spriteType?: string;
  size?: number;
  animation?: "idle" | "walk" | "attack";
  animated?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function PixelSprite({
  agentId,
  spriteType = "robot",
  size = 48,
  animation = "idle",
  animated = true,
  selected = false,
  onClick,
}: PixelSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const frameRef = useRef(0);

  const config: SpriteConfig | undefined =
    (agentId && AGENT_SPRITES[agentId]) || SPRITE_CONFIGS[spriteType];
  if (!config) return null;

  const isLpc = config.format === "lpc";

  // ── Resolve source image path ──
  let src: string;
  let frameW: number;
  let frameH: number;
  let frameCount: number;
  let srcX: (frame: number) => number;
  let srcY: number;

  if (isLpc && config.sheet) {
    // LPC: single sprite sheet, pick row based on animation
    src = config.sheet;
    const fs = config.lpcFrameSize ?? 64;
    frameW = fs;
    frameH = fs;
    const lpcAnim = LPC_ANIM_MAP[animation] ?? LPC_ANIM_MAP.idle;
    frameCount = animation === "idle" ? 1 : lpcAnim.frames;
    srcY = lpcAnim.row * fs;
    srcX = (frame) => frame * fs;
  } else {
    // Strip: separate PNG per animation
    src = animation === "walk" && config.walk
      ? config.walk
      : animation === "attack" && config.attack
        ? config.attack
        : config.idle;
    frameW = config.frameHeight; // square frames
    frameH = config.frameHeight;
    frameCount = animation === "walk"
      ? config.walkFrames
      : animation === "attack"
        ? config.attackFrames
        : config.idleFrames;
    srcY = 0;
    srcX = (frame) => frame * frameW;
  }

  // Load sprite image
  useEffect(() => {
    const image = new Image();
    image.src = src;
    image.onload = () => setImg(image);
    return () => { image.onload = null; };
  }, [src]);

  // Animate frames on canvas
  useEffect(() => {
    if (!img || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const interval = 1000 / SPRITE_FPS;
    let lastTime = 0;
    let animId: number;
    frameRef.current = 0;

    function draw(time: number) {
      if (time - lastTime >= interval) {
        frameRef.current = (frameRef.current + 1) % frameCount;
        lastTime = time;
        ctx!.clearRect(0, 0, size, size);
        ctx!.imageSmoothingEnabled = false;
        ctx!.drawImage(
          img!,
          srcX(frameRef.current), srcY, frameW, frameH,
          0, 0, size, size,
        );
      }
      if (animated) animId = requestAnimationFrame(draw);
    }

    // Draw first frame immediately
    ctx.clearRect(0, 0, size, size);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, srcX(0), srcY, frameW, frameH, 0, 0, size, size);

    if (animated) animId = requestAnimationFrame(draw);
    return () => { if (animId) cancelAnimationFrame(animId); };
  }, [img, animated, size, frameCount, frameW, frameH, srcY]);

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

  if (animated) {
    return (
      <motion.div
        animate={{ y: [0, -2, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        style={{ display: "inline-flex" }}
      >
        {canvas}
      </motion.div>
    );
  }

  return canvas;
}
