// Reasoning score: rewards flagging unknowns, decoding and correct lever attribution. It never reads the
// offer's price, commute, neighbourhood or the player's income, so no cash-vs-time preference is punished.
import type { Difficulty } from "./types";

export const DIFFICULTY_MULTIPLIER: Record<Difficulty, number> = { easy: 1, normal: 1.25, hard: 1.5 };

export const DIFFICULTY_INFO: Record<Difficulty, { label: string; blurb: string }> = {
  easy: { label: "Easy", blurb: "Costs as plain line items, unknowns flagged for you, commute in minutes." },
  normal: { label: "Normal", blurb: "Some costs only appear in the listing text. Spot them and flag them yourself." },
  hard: { label: "Hard", blurb: "Lease-style fine print, commutes given as route legs, and a raw CMHC table to read." },
};

export interface ScoreInput {
  difficulty: Difficulty;
  unknownsFlagged: number;
  unknownsTotal: number;
  leverCorrect: boolean;
  otherCardsCorrect: number;
  otherCardsTotal: number;
  /** Hard only: did the player add up the route legs correctly / read the right CMHC cell? null = not attempted. */
  commuteDecoded: boolean | null;
  tableRead: boolean | null;
}

export interface Score {
  base: number;
  decodeBonus: number;
  multiplier: number;
  total: number;
  parts: { label: string; points: number; max: number }[];
}

export function reasoningScore(s: ScoreInput): Score {
  const flags = s.unknownsTotal ? Math.round((40 * s.unknownsFlagged) / s.unknownsTotal) : 40;
  const lever = s.leverCorrect ? 30 : 0;
  const others = s.otherCardsTotal ? Math.round((30 * s.otherCardsCorrect) / s.otherCardsTotal) : 30;
  const parts = [
    { label: "Unknowns flagged before choosing", points: flags, max: 40 },
    { label: "City lever attributed correctly", points: lever, max: 30 },
    { label: "Other statements sorted correctly", points: others, max: 30 },
  ];
  if (s.difficulty === "hard") {
    parts.push({ label: "Commute decoded from route legs", points: s.commuteDecoded ? 10 : 0, max: 10 });
    parts.push({ label: "CMHC table read correctly", points: s.tableRead ? 10 : 0, max: 10 });
  }
  const base = flags + lever + others;
  const decodeBonus = parts.slice(3).reduce((a, p) => a + p.points, 0);
  const multiplier = DIFFICULTY_MULTIPLIER[s.difficulty];
  return { base, decodeBonus, multiplier, total: Math.round((base + decodeBonus) * multiplier), parts };
}

/** Haggle Time points, decided by code from the agreed rent: 4 points per dollar saved a month, capped at 200. Same in single-player and multiplayer. */
export function hagglePoints(askingCents: number, agreedCents: number): number {
  return Math.max(0, Math.min(200, Math.round((askingCents - agreedCents) / 100) * 4));
}
