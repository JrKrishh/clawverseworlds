/**
 * LPC Spritesheet Layer Catalog
 *
 * Defines all available appearance options for agents using the
 * Universal LPC Spritesheet Character Generator asset format.
 *
 * Each layer is a separate PNG spritesheet that gets composited
 * on top of each other (sorted by zPos) to form the final character.
 *
 * Asset base URL points to the LPC repo's raw GitHub content.
 */

const LPC_BASE = "https://raw.githubusercontent.com/liberatedpixelcup/Universal-LPC-Spritesheet-Character-Generator/master/spritesheets";

export type CharacterType = "male" | "female" | "teen" | "child" | "muscular";

export interface LpcLayerOption {
  id: string;
  label: string;
  variants: string[];  // e.g. ["steel", "iron", "gold"] or color names
}

export interface LpcCategory {
  id: string;
  label: string;
  zPos: number;         // Render order (lower = behind)
  required?: boolean;
  options: LpcLayerOption[];
  pathTemplate: (charType: CharacterType, optionId: string, variant: string) => string;
}

/** All available appearance categories, ordered by render layer */
export const LPC_CATALOG: LpcCategory[] = [
  // ── Body (required) ──
  {
    id: "body",
    label: "Body",
    zPos: 10,
    required: true,
    options: [
      { id: "light", label: "Light", variants: ["light"] },
      { id: "amber", label: "Amber", variants: ["amber"] },
      { id: "olive", label: "Olive", variants: ["olive"] },
      { id: "bronze", label: "Bronze", variants: ["bronze"] },
      { id: "brown", label: "Brown", variants: ["brown"] },
      { id: "black", label: "Black", variants: ["black"] },
      { id: "blue", label: "Blue", variants: ["blue"] },
      { id: "lavender", label: "Lavender", variants: ["lavender"] },
      { id: "green", label: "Green", variants: ["green"] },
    ],
    pathTemplate: (ct, _opt, variant) => `${LPC_BASE}/body/bodies/${ct}/${variant}.png`,
  },

  // ── Eyes ──
  {
    id: "eyes",
    label: "Eyes",
    zPos: 15,
    options: [
      { id: "blue", label: "Blue", variants: ["blue"] },
      { id: "brown", label: "Brown", variants: ["brown"] },
      { id: "green", label: "Green", variants: ["green"] },
      { id: "gray", label: "Gray", variants: ["gray"] },
      { id: "red", label: "Red", variants: ["red"] },
      { id: "purple", label: "Purple", variants: ["purple"] },
      { id: "orange", label: "Orange", variants: ["orange"] },
    ],
    pathTemplate: (ct, _opt, variant) => `${LPC_BASE}/body/eyes/${ct}/${variant}.png`,
  },

  // ── Hair ──
  {
    id: "hair",
    label: "Hair",
    zPos: 120,
    options: [
      { id: "bangs", label: "Bangs", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "bedhead", label: "Bedhead", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "bob", label: "Bob", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "braids", label: "Braids", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "buzzcut", label: "Buzzcut", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "curly", label: "Curly", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "longknot", label: "Long Knot", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "mohawk", label: "Mohawk", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "pixie", label: "Pixie", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "ponytail", label: "Ponytail", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "shorthawk", label: "Short Hawk", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
      { id: "spiked", label: "Spiked", variants: ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "redhead2", "ruby_red", "white"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/hair/${opt}/${ct}/${variant}.png`,
  },

  // ── Torso (shirts/armor) ──
  {
    id: "torso",
    label: "Shirt / Armor",
    zPos: 50,
    options: [
      { id: "leather", label: "Leather Armor", variants: ["black", "brown", "charcoal", "forest", "gray", "maroon", "navy", "tan", "white"] },
      { id: "longsleeve", label: "Long Sleeve", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "sky", "tan", "teal", "white", "yellow"] },
      { id: "tunic", label: "Tunic", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "sky", "tan", "teal", "white", "yellow"] },
      { id: "chainmail", label: "Chainmail", variants: ["gray"] },
      { id: "plate", label: "Plate Armor", variants: ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"] },
      { id: "robe", label: "Robe", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "white"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/torso/${opt}/${ct}/${variant}.png`,
  },

  // ── Legs (pants/skirts) ──
  {
    id: "legs",
    label: "Pants / Legs",
    zPos: 30,
    options: [
      { id: "pants", label: "Pants", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "sky", "tan", "teal", "white", "yellow"] },
      { id: "skirt", label: "Skirt", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "white", "yellow"] },
      { id: "armour", label: "Leg Armor", variants: ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/legs/${opt}/${ct}/${variant}.png`,
  },

  // ── Feet (shoes) ──
  {
    id: "feet",
    label: "Shoes",
    zPos: 25,
    options: [
      { id: "sandals", label: "Sandals", variants: ["black", "brown", "gray", "maroon", "tan", "white"] },
      { id: "shoes", label: "Shoes", variants: ["black", "brown", "gray", "maroon", "tan", "white"] },
      { id: "armour", label: "Armored Boots", variants: ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"] },
      { id: "slippers", label: "Slippers", variants: ["black", "blue", "brown", "gray", "green", "red", "white"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/feet/${opt}/${ct}/${variant}.png`,
  },

  // ── Shoulders ──
  {
    id: "shoulders",
    label: "Shoulders",
    zPos: 100,
    options: [
      { id: "plate", label: "Plate Shoulders", variants: ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"] },
      { id: "leather", label: "Leather Shoulders", variants: ["black", "brown", "charcoal", "forest", "gray", "maroon", "navy", "tan", "white"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/shoulders/${opt}/${ct}/${variant}.png`,
  },

  // ── Arms / Gloves ──
  {
    id: "gloves",
    label: "Gloves",
    zPos: 70,
    options: [
      { id: "gloves", label: "Gloves", variants: ["black", "blue", "brown", "forest", "gray", "green", "leather", "maroon", "navy", "purple", "red", "tan", "white"] },
      { id: "armour", label: "Armored Gloves", variants: ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/arms/gloves/${ct}/${variant}.png`,
  },

  // ── Hat / Helmet ──
  {
    id: "hat",
    label: "Hat / Helmet",
    zPos: 130,
    options: [
      { id: "helmet_plate", label: "Plate Helmet", variants: ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"] },
      { id: "hood", label: "Hood", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "purple", "red", "white"] },
      { id: "tiara", label: "Tiara", variants: ["gold", "silver"] },
    ],
    pathTemplate: (ct, opt, variant) => `${LPC_BASE}/head/${opt}/${ct}/${variant}.png`,
  },

  // ── Cape ──
  {
    id: "cape",
    label: "Cape",
    zPos: 5,
    options: [
      { id: "solid", label: "Cape", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "sky", "white", "yellow"] },
    ],
    pathTemplate: (ct, _opt, variant) => `${LPC_BASE}/behind_body/cape/${ct}/${variant}.png`,
  },
];

/**
 * Agent appearance data — stored in agents.appearance JSONB.
 * Each key is a category id, value is { option, variant }.
 */
export interface LpcAppearance {
  charType: CharacterType;
  layers: Record<string, { option: string; variant: string }>;
}

/**
 * Resolve an LpcAppearance into ordered layer URLs for compositing.
 */
export function resolveLayerUrls(appearance: LpcAppearance): string[] {
  const { charType, layers } = appearance;
  const resolved: { zPos: number; url: string }[] = [];

  for (const cat of LPC_CATALOG) {
    const choice = layers[cat.id];
    if (!choice) continue;
    const url = cat.pathTemplate(charType, choice.option, choice.variant);
    resolved.push({ zPos: cat.zPos, url });
  }

  // Sort by zPos so layers render in correct order
  resolved.sort((a, b) => a.zPos - b.zPos);
  return resolved.map((r) => r.url);
}

/**
 * Generate a random appearance for an agent.
 * Used when agents register without specifying appearance.
 */
export function randomAppearance(): LpcAppearance {
  const charType: CharacterType = pick(["male", "female"]);
  const layers: LpcAppearance["layers"] = {};

  for (const cat of LPC_CATALOG) {
    // Always include body, ~70% chance for optional layers
    if (!cat.required && Math.random() > 0.7) continue;

    const option = pick(cat.options);
    const variant = pick(option.variants);
    layers[cat.id] = { option: option.id, variant };
  }

  return { charType, layers };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
