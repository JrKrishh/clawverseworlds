/**
 * Pixel sprite configuration for Clawverse agents.
 *
 * Supports two sprite formats:
 *  1. Strip-based: separate PNG per animation (townspeople, cyberpunk chars)
 *     - 48×48 frames, horizontal strip, 4-12 frames per strip
 *  2. LPC sheet: single PNG grid with all animations in rows
 *     - 64×64 frames, 13 columns × 21+ rows
 *     - Generated via Universal LPC Spritesheet Character Generator
 */

export type SpriteFormat = "strip" | "lpc";

export interface SpriteConfig {
  format: SpriteFormat;
  // Strip format fields
  idle: string;
  walk?: string;
  attack?: string;
  frameHeight: number;
  idleFrames: number;
  walkFrames: number;
  attackFrames: number;
  // LPC sheet format fields (single PNG with all anims in rows)
  sheet?: string;         // path to full LPC sprite sheet
  lpcFrameSize?: number;  // 64 for standard LPC
}

/**
 * LPC Sprite Sheet Row Layout (Universal LPC standard):
 *   Row 0:  Spellcast Up      (7 frames)
 *   Row 1:  Spellcast Left    (7 frames)
 *   Row 2:  Spellcast Down    (7 frames)
 *   Row 3:  Spellcast Right   (7 frames)
 *   Row 4:  Thrust Up         (8 frames)
 *   Row 5:  Thrust Left       (8 frames)
 *   Row 6:  Thrust Down       (8 frames)
 *   Row 7:  Thrust Right      (8 frames)
 *   Row 8:  Walk Up           (9 frames)
 *   Row 9:  Walk Left         (9 frames)
 *   Row 10: Walk Down         (9 frames)
 *   Row 11: Walk Right        (9 frames)
 *   Row 12: Slash Up          (6 frames)
 *   Row 13: Slash Left        (6 frames)
 *   Row 14: Slash Down        (6 frames)
 *   Row 15: Slash Right       (6 frames)
 *   Row 16: Shoot Up          (13 frames)
 *   Row 17: Shoot Left        (13 frames)
 *   Row 18: Shoot Down        (13 frames)
 *   Row 19: Shoot Right       (13 frames)
 *   Row 20: Hurt              (6 frames)
 */
export const LPC_ROWS = {
  spellcastUp: { row: 0, frames: 7 },
  spellcastLeft: { row: 1, frames: 7 },
  spellcastDown: { row: 2, frames: 7 },
  spellcastRight: { row: 3, frames: 7 },
  thrustUp: { row: 4, frames: 8 },
  thrustLeft: { row: 5, frames: 8 },
  thrustDown: { row: 6, frames: 8 },
  thrustRight: { row: 7, frames: 8 },
  walkUp: { row: 8, frames: 9 },
  walkLeft: { row: 9, frames: 9 },
  walkDown: { row: 10, frames: 9 },
  walkRight: { row: 11, frames: 9 },
  slashUp: { row: 12, frames: 6 },
  slashLeft: { row: 13, frames: 6 },
  slashDown: { row: 14, frames: 6 },
  slashRight: { row: 15, frames: 6 },
  shootUp: { row: 16, frames: 13 },
  shootLeft: { row: 17, frames: 13 },
  shootDown: { row: 18, frames: 13 },
  shootRight: { row: 19, frames: 13 },
  hurt: { row: 20, frames: 6 },
} as const;

/** Maps animation name → which LPC row + frame count to use */
export const LPC_ANIM_MAP = {
  idle: LPC_ROWS.walkDown,       // Use walk-down frame 0 as idle
  walk: LPC_ROWS.walkDown,       // Walk facing camera
  attack: LPC_ROWS.slashDown,    // Melee slash facing camera
  cast: LPC_ROWS.spellcastDown,  // Spellcast facing camera
  shoot: LPC_ROWS.shootDown,     // Ranged attack facing camera
  hurt: LPC_ROWS.hurt,
} as const;

// ── Strip-based helpers ─────────────────────────────────────────────────────

// Townspeople NPCs (48×48, 6 frames each)
const townsprite = (n: string): SpriteConfig => ({
  format: "strip",
  idle: `/assets/sprites/townspeople/${n}-idle.png`,
  walk: `/assets/sprites/townspeople/${n}-walk.png`,
  frameHeight: 48,
  idleFrames: 6,
  walkFrames: 6,
  attackFrames: 6,
});

// Cyberpunk chars (48×48, 4 idle / 6 run / variable attack)
const cyberChar = (n: string): SpriteConfig => ({
  format: "strip",
  idle: `/assets/sprites/cyberpunk-chars/${n}-idle.png`,
  walk: `/assets/sprites/cyberpunk-chars/${n}-run.png`,
  attack: `/assets/sprites/cyberpunk-chars/${n}-attack.png`,
  frameHeight: 48,
  idleFrames: 4,
  walkFrames: 6,
  attackFrames: 6,
});

// Modern Interiors characters (32×32 frames in 384×32 strips = 12 frames)
const modernChar = (n: string): SpriteConfig => ({
  format: "strip",
  idle: `/assets/sprites/modern-chars/${n}-idle.png`,
  walk: `/assets/sprites/modern-chars/${n}-run.png`,
  frameHeight: 32,
  idleFrames: 12,
  walkFrames: 12,
  attackFrames: 12,
});

// ── LPC sheet helper ────────────────────────────────────────────────────────

/** Create config for an LPC spritesheet (64×64 grid, all anims in one PNG) */
const lpcSprite = (filename: string): SpriteConfig => ({
  format: "lpc",
  sheet: `/assets/sprites/lpc/${filename}`,
  lpcFrameSize: 64,
  // Strip fields unused for LPC but required by interface
  idle: `/assets/sprites/lpc/${filename}`,
  frameHeight: 64,
  idleFrames: 9,
  walkFrames: 9,
  attackFrames: 6,
});

// ── Sprite type configs ─────────────────────────────────────────────────────

/** Map sprite_type values to pixel sprite configs */
export const SPRITE_CONFIGS: Record<string, SpriteConfig> = {
  // Sprite types → townspeople NPCs
  robot:    townsprite("npc-01"),
  diplomat: townsprite("npc-02"),
  wizard:   townsprite("npc-03"),
  engineer: townsprite("npc-04"),
  crystal:  townsprite("npc-05"),
  scout:    townsprite("npc-06"),
  hacker:   townsprite("npc-07"),
  ghost:    townsprite("npc-09"),

  // Cyberpunk character sprites
  biker:  cyberChar("biker"),
  punk:   cyberChar("punk"),
  cyborg: cyberChar("cyborg"),

  // Modern Interiors characters
  adam:   modernChar("adam"),
  alex:   modernChar("alex"),
  amelia: modernChar("amelia"),
  bob:    modernChar("bob"),

  // LPC characters (generated via Universal LPC Spritesheet Generator)
  // Add more as you generate them — just drop the PNG in public/assets/sprites/lpc/
  lpc_warrior: lpcSprite("warrior.png"),
  lpc_mage:    lpcSprite("mage.png"),
  lpc_rogue:   lpcSprite("rogue.png"),
  lpc_cleric:  lpcSprite("cleric.png"),
};

export const SPRITE_FPS = 8;

// ── Per-agent sprite overrides (by agent_id) ──────────────────────────────
// Named demo agents get unique sprites — can be strip OR lpc format

const agentStrip = (n: string, frames: number, hasWalk: boolean, hasAttack: boolean): SpriteConfig => ({
  format: "strip",
  idle: `/assets/sprites/agents/${n}-idle.png`,
  walk: hasWalk ? `/assets/sprites/agents/${n}-run.png` : undefined,
  attack: hasAttack ? `/assets/sprites/agents/${n}-attack.png` : undefined,
  frameHeight: 48,
  idleFrames: frames,
  walkFrames: hasWalk ? 6 : frames,
  attackFrames: hasAttack ? 6 : frames,
});

/** Create an LPC config for a specific demo agent */
const agentLpc = (filename: string): SpriteConfig => ({
  format: "lpc",
  sheet: `/assets/sprites/agents/${filename}`,
  lpcFrameSize: 64,
  idle: `/assets/sprites/agents/${filename}`,
  frameHeight: 64,
  idleFrames: 9,
  walkFrames: 9,
  attackFrames: 6,
});

export const AGENT_SPRITES: Record<string, SpriteConfig> = {
  // Demo agents — switch any of these to agentLpc() once you generate their LPC sheet
  "agt_3ym8hq42": agentStrip("phantom-x", 4, true, true),   // Phantom-X → cyborg
  "agt_jv8dhol0": agentStrip("voidspark", 4, true, true),    // VoidSpark → punk
  "agt_6whjuds6": { ...townsprite("npc-08"), idle: "/assets/sprites/agents/nullbot-idle.png" },  // NullBot
  "agt_33u0psmn": { ...townsprite("npc-05"), idle: "/assets/sprites/agents/crystara-idle.png" }, // Crystara

  // Example: swap Phantom-X to an LPC sprite sheet:
  // "agt_3ym8hq42": agentLpc("phantom-x-lpc.png"),
};
