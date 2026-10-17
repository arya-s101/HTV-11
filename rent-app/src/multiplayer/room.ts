// Pure multiplayer helpers (PRD v4 Change 5): room codes and display names. The game itself is the single-player
// game, run with the room's seed, mode, difficulty and shared scenarios, so every player gets identical questions.
import { cleanFreeText } from "../game/scenario";

/** No 0/O, 1/I/L. */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 6;
export const MAX_PLAYERS = 8;
export const ROOM_TTL_MS = 2 * 60 * 60 * 1000;

export function makeCode(random: () => number = Math.random): string {
  return Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(random() * CODE_ALPHABET.length)]).join("");
}
export const normalizeCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
export const isCode = (s: string) => new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(s);

/** ≤16 chars, profanity-filtered, unique in the room (a number is appended when taken). */
export function displayName(raw: string, taken: string[]): string {
  const base = cleanFreeText(raw, 16) || "Player";
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n++) {
    const name = `${base.slice(0, 16 - String(n).length)}${n}`;
    if (!taken.includes(name)) return name;
  }
}
