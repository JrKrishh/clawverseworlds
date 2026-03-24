import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { resolveLayerUrls, type LpcAppearance } from "../lib/lpcCatalog";
import { LPC_ANIM_MAP, SPRITE_FPS } from "../lib/agentSprites";

interface LpcSpriteProps {
  appearance: LpcAppearance;
  size?: number;
  animation?: "idle" | "walk" | "attack";
  animated?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

const FRAME_SIZE = 64;

/**
 * Composites multiple LPC layer PNGs on a canvas in real-time.
 * Each layer is a full spritesheet — we draw the same frame from each,
 * stacked by z-order, to produce the final character.
 */
export function LpcSprite({
  appearance,
  size = 64,
  animation = "idle",
  animated = true,
  selected = false,
  onClick,
}: LpcSpriteProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [images, setImages] = useState<HTMLImageElement[]>([]);
  const frameRef = useRef(0);

  const layerUrls = resolveLayerUrls(appearance);

  // Load all layer images
  useEffect(() => {
    let cancelled = false;
    const loaded: HTMLImageElement[] = [];
    let count = 0;

    if (layerUrls.length === 0) return;

    for (const url of layerUrls) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => {
        count++;
        if (!cancelled && count === layerUrls.length) {
          setImages(loaded);
        }
      };
      img.onerror = () => {
        // Skip broken layers, still count them
        count++;
        if (!cancelled && count === layerUrls.length) {
          setImages(loaded.filter((i) => i.complete && i.naturalWidth > 0));
        }
      };
      loaded.push(img);
    }

    return () => { cancelled = true; };
  }, [layerUrls.join(",")]);

  // Animate
  const lpcAnim = LPC_ANIM_MAP[animation] ?? LPC_ANIM_MAP.idle;
  const frameCount = animation === "idle" ? 1 : lpcAnim.frames;
  const srcY = lpcAnim.row * FRAME_SIZE;

  useEffect(() => {
    if (images.length === 0 || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;

    const interval = 1000 / SPRITE_FPS;
    let lastTime = 0;
    let animId: number;
    frameRef.current = 0;

    function drawFrame(frame: number) {
      ctx!.clearRect(0, 0, size, size);
      ctx!.imageSmoothingEnabled = false;
      const srcX = frame * FRAME_SIZE;
      for (const img of images) {
        if (img.complete && img.naturalWidth > 0) {
          ctx!.drawImage(img, srcX, srcY, FRAME_SIZE, FRAME_SIZE, 0, 0, size, size);
        }
      }
    }

    function loop(time: number) {
      if (time - lastTime >= interval) {
        frameRef.current = (frameRef.current + 1) % frameCount;
        lastTime = time;
        drawFrame(frameRef.current);
      }
      if (animated) animId = requestAnimationFrame(loop);
    }

    // Draw first frame immediately
    drawFrame(0);
    if (animated && frameCount > 1) animId = requestAnimationFrame(loop);

    return () => { if (animId) cancelAnimationFrame(animId); };
  }, [images, animated, size, frameCount, srcY]);

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
