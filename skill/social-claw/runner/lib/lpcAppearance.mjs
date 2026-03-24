/**
 * LPC appearance generator for agents.
 * Generates random character appearance using Universal LPC Spritesheet layer catalog.
 * The frontend composites these layers into animated sprites.
 */

const HAIR_COLORS = ["black", "blonde", "brown", "brunette", "dark_blonde", "gray", "green", "light_blonde", "pink", "purple", "redhead", "ruby_red", "white"];
const FABRIC_COLORS = ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "orange", "pink", "purple", "red", "sky", "tan", "teal", "white", "yellow"];
const METAL_VARIANTS = ["brass", "bronze", "ceramic", "copper", "gold", "iron", "silver", "steel"];
const SHOE_COLORS = ["black", "brown", "gray", "maroon", "tan", "white"];

const CATALOG = [
  {
    id: "body",
    required: true,
    options: [
      { id: "light", variants: ["light"] },
      { id: "amber", variants: ["amber"] },
      { id: "olive", variants: ["olive"] },
      { id: "bronze", variants: ["bronze"] },
      { id: "brown", variants: ["brown"] },
      { id: "black", variants: ["black"] },
      { id: "blue", variants: ["blue"] },
      { id: "lavender", variants: ["lavender"] },
      { id: "green", variants: ["green"] },
    ],
  },
  {
    id: "eyes",
    required: false,
    options: [
      { id: "blue", variants: ["blue"] },
      { id: "brown", variants: ["brown"] },
      { id: "green", variants: ["green"] },
      { id: "gray", variants: ["gray"] },
      { id: "red", variants: ["red"] },
      { id: "purple", variants: ["purple"] },
    ],
  },
  {
    id: "hair",
    required: false,
    options: [
      { id: "bangs", variants: HAIR_COLORS },
      { id: "bedhead", variants: HAIR_COLORS },
      { id: "bob", variants: HAIR_COLORS },
      { id: "braids", variants: HAIR_COLORS },
      { id: "buzzcut", variants: HAIR_COLORS },
      { id: "curly", variants: HAIR_COLORS },
      { id: "longknot", variants: HAIR_COLORS },
      { id: "mohawk", variants: HAIR_COLORS },
      { id: "pixie", variants: HAIR_COLORS },
      { id: "ponytail", variants: HAIR_COLORS },
      { id: "shorthawk", variants: HAIR_COLORS },
      { id: "spiked", variants: HAIR_COLORS },
    ],
  },
  {
    id: "torso",
    required: false,
    options: [
      { id: "leather", variants: ["black", "brown", "charcoal", "forest", "gray", "maroon", "navy", "tan", "white"] },
      { id: "longsleeve", variants: FABRIC_COLORS },
      { id: "tunic", variants: FABRIC_COLORS },
      { id: "chainmail", variants: ["gray"] },
      { id: "plate", variants: METAL_VARIANTS },
      { id: "robe", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "purple", "red", "white"] },
    ],
  },
  {
    id: "legs",
    required: false,
    options: [
      { id: "pants", variants: FABRIC_COLORS },
      { id: "skirt", variants: FABRIC_COLORS },
      { id: "armour", variants: METAL_VARIANTS },
    ],
  },
  {
    id: "feet",
    required: false,
    options: [
      { id: "sandals", variants: SHOE_COLORS },
      { id: "shoes", variants: SHOE_COLORS },
      { id: "armour", variants: METAL_VARIANTS },
      { id: "slippers", variants: ["black", "blue", "brown", "gray", "green", "red", "white"] },
    ],
  },
  {
    id: "shoulders",
    required: false,
    options: [
      { id: "plate", variants: METAL_VARIANTS },
      { id: "leather", variants: ["black", "brown", "charcoal", "forest", "gray", "maroon", "navy", "tan", "white"] },
    ],
  },
  {
    id: "gloves",
    required: false,
    options: [
      { id: "gloves", variants: ["black", "blue", "brown", "forest", "gray", "green", "leather", "maroon", "navy", "purple", "red", "tan", "white"] },
      { id: "armour", variants: METAL_VARIANTS },
    ],
  },
  {
    id: "hat",
    required: false,
    options: [
      { id: "helmet_plate", variants: METAL_VARIANTS },
      { id: "hood", variants: ["black", "blue", "brown", "forest", "gray", "green", "lavender", "maroon", "navy", "purple", "red", "white"] },
      { id: "tiara", variants: ["gold", "silver"] },
    ],
  },
  {
    id: "cape",
    required: false,
    options: [
      { id: "solid", variants: FABRIC_COLORS },
    ],
  },
];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Generate a random LPC appearance.
 * Returns { charType, layers } matching the frontend LpcAppearance type.
 */
export function randomAppearance() {
  const charType = pick(["male", "female"]);
  const layers = {};

  for (const cat of CATALOG) {
    // Always include required layers (body), 75% chance for optional
    if (!cat.required && Math.random() > 0.75) continue;

    const option = pick(cat.options);
    const variant = pick(option.variants);
    layers[cat.id] = { option: option.id, variant };
  }

  return { charType, layers };
}
