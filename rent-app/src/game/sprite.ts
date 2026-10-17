// Original layered 16×24 pixel-art character. Appearance is cosmetic only: nothing in the game's
// calculations, offers or feedback reads it (enforced by tests).

export const SKIN = ["#f6d7b8", "#eac09a", "#d39e74", "#b07850", "#8a5a3b", "#5e3b26"] as const;
export const HAIR_COLOR = ["#1f1a17", "#4a2e1c", "#8a5a2b", "#d8a64a", "#b8432f", "#6a5acd", "#e6e1d6"] as const;
export const OUTFIT_COLOR = ["#3f6fd8", "#d64545", "#2f9e6a", "#e0a020", "#8a4fd0", "#30343f", "#e86fa6"] as const;
export const HAIR_STYLES = ["short", "long", "bun", "curly", "buzz", "ponytail"] as const;
export const OUTFITS = ["tee", "hoodie", "jacket", "dress"] as const;
export const ACCESSORIES = ["none", "glasses", "cap", "headphones", "scarf"] as const;

export interface Appearance {
  skin: number;
  hairStyle: (typeof HAIR_STYLES)[number];
  hairColor: number;
  outfit: (typeof OUTFITS)[number];
  outfitColor: number;
  accessory: (typeof ACCESSORIES)[number];
}

export interface Character {
  name: string;
  startAge: number;
  appearance: Appearance;
}

export const DEMO_CHARACTER: Character = {
  name: "Sam",
  startAge: 20,
  appearance: { skin: 2, hairStyle: "curly", hairColor: 0, outfit: "hoodie", outfitColor: 0, accessory: "headphones" },
};

export const W = 16;
export const H = 24;

// Legend: S skin, E eye, M mouth, O outfit, D outfit shade, W shirt, P pants, B shoes.
const BASE = [
  "................",
  "................",
  ".....SSSSSS.....",
  "....SSSSSSSS....",
  "....SSSSSSSS....",
  "....SESSSSES....",
  "....SSSSSSSS....",
  "....SSSMMSSS....",
  ".....SSSSSS.....",
  "......SSSS......",
  "....OOOOOOOO....",
  "...OOOOOOOOOO...",
  "..OOOOOOOOOOOO..",
  "..OOOOOOOOOOOO..",
  "..SOOOOOOOOOOS..",
  "..SOOOOOOOOOOS..",
  "....OOOOOOOO....",
  "....PPPPPPPP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "....PPP..PPP....",
  "...BBBB..BBBB...",
  "................",
];

// Overlays: "." keeps what's below; any other letter paints that token.
const HAIR: Record<Appearance["hairStyle"], string[]> = {
  short: [
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....H......H....",
  ],
  long: [
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "...HH......HH...",
    "...H........H...",
    "...H........H...",
    "...H........H...",
    "...HH......HH...",
    "...HHH....HHH...",
    "...HH......HH...",
  ],
  bun: [
    "......HHHH......",
    ".....HHHHHH.....",
    "....HHHHHHHH....",
    "....HHHHHHHH....",
    "....H......H....",
  ],
  curly: [
    "....HHHHHHHH....",
    "...HHHHHHHHHH...",
    "..HHHHHHHHHHHH..",
    "..HHHHHHHHHHHH..",
    "..HH........HH..",
    "..H..........H..",
    "..HH........HH..",
  ],
  buzz: [
    "................",
    "................",
    "....HHHHHHHH....",
    "....H......H....",
  ],
  ponytail: [
    "................",
    ".....HHHHHH.....",
    "....HHHHHHHHH...",
    "....HHHHHHHHHH..",
    "....H......HHH..",
    "............HH..",
    "............HH..",
    ".............H..",
  ],
};

const OUTFIT: Record<Appearance["outfit"], { rows: number; art: string[] }> = {
  tee: {
    rows: 10,
    art: [
      "....OOOOOOOO....",
      "...OOOOOOOOOO...",
      "..OOOOOOOOOOOO..",
      "..SOOOOOOOOOOS..",
      "..SOOOOOOOOOOS..",
      "..SOOOOOOOOOOS..",
    ],
  },
  hoodie: {
    rows: 9,
    art: [
      "....DD....DD....",
      "....OOOWWOOO....",
      "...OOOOWWOOOO...",
      "..OOOOOOOOOOOO..",
      "..OOODDDDDDOOO..",
      "..SOODDDDDDOOS..",
      "..SOOOOOOOOOOS..",
    ],
  },
  jacket: {
    rows: 10,
    art: [
      "....OOOWWOOO....",
      "...OOOOWWOOOO...",
      "..OOOOOWWOOOOO..",
      "..OOOOOWWOOOOO..",
      "..SOOOOWWOOOOS..",
      "..SOOOOWWOOOOS..",
      "....OOOWWOOO....",
    ],
  },
  dress: {
    rows: 10,
    art: [
      "....OOOOOOOO....",
      "...OOOOOOOOOO...",
      "..SOOOOOOOOOOS..",
      "..SOOOOOOOOOOS..",
      "..SOOOOOOOOOOS..",
      "...OOOOOOOOOO...",
      "...OOOOOOOOOO...",
      "..OOOOOOOOOOOO..",
      "..DDDDDDDDDDDD..",
      ".....SS..SS.....",
      ".....SS..SS.....",
      ".....SS..SS.....",
    ],
  },
};

const ACCESSORY: Record<Appearance["accessory"], { row: number; art: string[] }> = {
  none: { row: 0, art: [] },
  glasses: { row: 5, art: ["....GEGGGGEG...."] },
  cap: { row: 0, art: ["................", ".....CCCCCC.....", "....CCCCCCCCCC..", "....CCCCCCCCCCC."] },
  headphones: {
    row: 1,
    art: ["....KKKKKKKK....", "...K........K...", "...K........K...", "..KK........KK..", "..KK........KK..", "..KK........KK.."],
  },
  scarf: { row: 9, art: ["....FFFFFFFF....", "....FFFFFFFF....", "......FF........", "......FF........"] },
};

export type Pixel = string | null;

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}

function paint(grid: string[][], art: string[], top: number) {
  art.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch !== "." && grid[top + r]) grid[top + r][c] = ch;
    });
  });
}

/** Composes the layers into a W×H grid of colours (null = transparent). Pure and deterministic. */
export function composeSprite(a: Appearance): Pixel[][] {
  const grid = BASE.map((r) => [...r]);
  const o = OUTFIT[a.outfit];
  paint(grid, o.art, o.rows);
  paint(grid, HAIR[a.hairStyle], 0);
  paint(grid, ACCESSORY[a.accessory].art, ACCESSORY[a.accessory].row);
  const skin = SKIN[a.skin];
  const outfit = OUTFIT_COLOR[a.outfitColor];
  const palette: Record<string, string> = {
    S: skin,
    E: "#1b1b2a",
    M: shade(skin, 0.72),
    O: outfit,
    D: shade(outfit, 0.72),
    W: "#f4f1ea",
    P: "#2d3450",
    B: "#1a1a1a",
    H: HAIR_COLOR[a.hairColor],
    G: "#1b1b2a",
    C: shade(outfit, 1.25),
    K: "#3a3a46",
    F: shade(outfit, 1.3),
  };
  return grid.map((row) => row.map((ch) => (ch === "." ? null : palette[ch] ?? null)));
}
