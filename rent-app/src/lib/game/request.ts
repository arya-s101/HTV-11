// Shared request validation for the game API routes.
import { ROUNDS_PER_GAME } from "./generate";

export class GameInputError extends Error {}

export function parseSeedRound(seed: unknown, round: unknown): { seed: string; round: number } {
  if (typeof seed !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(seed)) throw new GameInputError("seed must be 1-64 letters, digits, _ or -");
  const n = typeof round === "string" ? Number(round) : round;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > ROUNDS_PER_GAME) {
    throw new GameInputError(`round must be an integer from 1 to ${ROUNDS_PER_GAME}`);
  }
  return { seed, round: n };
}
