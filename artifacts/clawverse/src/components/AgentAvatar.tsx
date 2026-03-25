import { useMemo } from "react";
import { LpcSprite } from "./LpcSprite";
import type { LpcAppearance } from "../lib/lpcCatalog";

interface AgentAvatarProps {
  agentId?: string;
  spriteType?: string;
  color?: string;
  size?: number;
  selected?: boolean;
  animated?: boolean;
  animation?: "idle" | "walk" | "attack";
  onClick?: () => void;
  appearance?: LpcAppearance | null;
}

// Deterministic hash from string → number
function hash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[seed % arr.length];
}

const SKIN_OPTS = ["light", "amber", "olive", "bronze", "brown", "lavender", "blue"];
const HAIR_OPTS = ["black", "blonde", "brown", "green", "pink", "purple", "redhead", "white"];
const HAIR_STYLES = ["bangs", "buzzcut", "mohawk", "ponytail", "spiked", "bob", "curly", "pixie"];
const TORSO_TYPES = ["leather", "longsleeve", "tunic", "plate", "robe", "chainmail"];
const TORSO_COLORS = ["black", "blue", "brown", "forest", "gray", "green", "maroon", "navy", "purple", "red", "white"];
const LEGS_COLORS = ["black", "blue", "brown", "gray", "navy", "tan", "white"];
const FEET_COLORS = ["black", "brown", "gray", "tan", "white"];

/** Generate a deterministic appearance from agentId/name so every agent always has a pixel character */
function generateAppearance(seed: string): LpcAppearance {
  const h = hash(seed);
  const charType = h % 2 === 0 ? "male" : "female";

  const layers: LpcAppearance["layers"] = {
    body: { option: pick(SKIN_OPTS, h), variant: pick(SKIN_OPTS, h) },
    eyes: { option: pick(["blue", "brown", "green", "red", "purple"], h >> 3), variant: pick(["blue", "brown", "green", "red", "purple"], h >> 3) },
    hair: { option: pick(HAIR_STYLES, h >> 5), variant: pick(HAIR_OPTS, h >> 7) },
    torso: { option: pick(TORSO_TYPES, h >> 9), variant: pick(TORSO_COLORS, h >> 11) },
    legs: { option: "pants", variant: pick(LEGS_COLORS, h >> 13) },
    feet: { option: "shoes", variant: pick(FEET_COLORS, h >> 15) },
  };

  // 40% chance of hat
  if (h % 5 < 2) {
    layers.hat = { option: pick(["hood", "tiara", "helmet_plate"], h >> 17), variant: pick(["gold", "silver", "black", "purple", "blue"], h >> 19) };
  }
  // 30% chance of cape
  if (h % 10 < 3) {
    layers.cape = { option: "solid", variant: pick(TORSO_COLORS, h >> 21) };
  }

  return { charType: charType as "male" | "female", layers };
}

/**
 * Renders a pixel character for any agent.
 * Uses appearance JSONB if available, otherwise generates one deterministically from agentId.
 */
export function AgentAvatar({
  agentId,
  spriteType = "robot",
  color: _color = "blue",
  size = 32,
  selected = false,
  animated = false,
  animation = "idle",
  onClick,
  appearance,
}: AgentAvatarProps) {
  // Use stored appearance, or generate one from agentId/spriteType
  const finalAppearance = useMemo(() => {
    if (appearance?.charType && appearance?.layers && Object.keys(appearance.layers).length > 0) {
      return appearance;
    }
    // Generate deterministic appearance from agent identity
    return generateAppearance(agentId ?? spriteType ?? "default");
  }, [appearance, agentId, spriteType]);

  return (
    <LpcSprite
      appearance={finalAppearance}
      size={size}
      animation={animation}
      selected={selected}
      animated={animated}
      onClick={onClick}
    />
  );
}
