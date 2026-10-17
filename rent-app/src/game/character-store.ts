// The player's character lives on its own page (/character) and is shared by single-player and multiplayer games.
// Saved on this device only (localStorage, wrapped in try/catch). Appearance and identity stay cosmetic.
import { presetProfession } from "./career";
import { DEFAULT_AGE } from "./life";
import { DEMO_CHARACTER, type Character } from "./sprite";
import type { Difficulty } from "./types";

const KEY = "trd.character";
const DIFF_KEY = "trd.difficulty";

export const NEW_CHARACTER: Character = { ...DEMO_CHARACTER, name: "", startAge: DEFAULT_AGE };

export function loadCharacter(): Character | null {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!raw || typeof raw !== "object" || !raw.appearance) return null;
    const profession = raw.profession?.id ? raw.profession : presetProfession("software");
    return { ...NEW_CHARACTER, ...raw, profession, name: String(raw.name ?? "").slice(0, 16) };
  } catch {
    return null;
  }
}
export function saveCharacter(c: Character) {
  try {
    localStorage.setItem(KEY, JSON.stringify(c));
  } catch {
    // not remembered
  }
}
export function loadDifficulty(): Difficulty {
  try {
    const d = localStorage.getItem(DIFF_KEY);
    return d === "normal" || d === "hard" ? d : "easy";
  } catch {
    return "easy";
  }
}
export function saveDifficulty(d: Difficulty) {
  try {
    localStorage.setItem(DIFF_KEY, d);
  } catch {
    // not remembered
  }
}
