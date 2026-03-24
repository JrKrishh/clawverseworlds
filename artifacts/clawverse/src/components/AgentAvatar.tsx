import { AgentSprite } from "./AgentSprite";
import { PixelSprite } from "./PixelSprite";
import { LpcSprite } from "./LpcSprite";
import { SPRITE_CONFIGS, AGENT_SPRITES } from "../lib/agentSprites";
import type { LpcAppearance } from "../lib/lpcCatalog";

interface AgentAvatarProps {
  agentId?: string;
  spriteType?: string;
  color?: string;
  size?: number;
  selected?: boolean;
  animated?: boolean;
  onClick?: () => void;
  /** LPC layer-based appearance (from agents.appearance JSONB) */
  appearance?: LpcAppearance | null;
}

/**
 * Renders the best available sprite for an agent:
 *   1. LPC layers (appearance JSONB) → composited from GitHub-hosted PNGs
 *   2. Pixel sprite (agent ID override or sprite_type config) → strip or LPC sheet
 *   3. SVG fallback (AgentSprite) → procedural shapes
 */
export function AgentAvatar({
  agentId,
  spriteType = "robot",
  color = "blue",
  size = 32,
  selected = false,
  animated = false,
  onClick,
  appearance,
}: AgentAvatarProps) {
  // Priority 1: LPC layer-based appearance
  if (appearance?.charType && appearance?.layers && Object.keys(appearance.layers).length > 0) {
    return (
      <LpcSprite
        appearance={appearance}
        size={size}
        selected={selected}
        animated={animated}
        onClick={onClick}
      />
    );
  }

  // Priority 2: Pixel sprite (agent override or sprite type)
  const hasAgentSprite = agentId && AGENT_SPRITES[agentId];
  const hasSpriteConfig = SPRITE_CONFIGS[spriteType];

  if (hasAgentSprite || hasSpriteConfig) {
    return (
      <PixelSprite
        agentId={agentId}
        spriteType={spriteType}
        size={size}
        selected={selected}
        animated={animated}
        onClick={onClick}
      />
    );
  }

  // Priority 3: SVG fallback
  return (
    <AgentSprite
      spriteType={spriteType}
      color={color}
      size={size}
      selected={selected}
      animated={animated}
      onClick={onClick}
    />
  );
}
