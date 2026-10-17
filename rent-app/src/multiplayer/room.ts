// Pure multiplayer helpers (PRD v4 Change 5): room codes, display names and the shared question list.
// Everyone in a room sees the same questions, option order and stat cards; nothing personal is used.
import { MODES } from "../config/modes";
import { STAGES } from "../game/data";
import { content, J, listingsFor } from "../game/journey";
import { money } from "../game/outcome";
import { planRun, template, type ScenarioMap } from "../game/questions";
import { cleanFreeText, fill } from "../game/scenario";
import type { Difficulty, PlayableStage } from "../game/types";

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

export interface RoomQuestion {
  index: number;
  round: string;
  title: string;
  scenario: string;
  prompt: string;
  options: string[];
  /** Question id for the stat card shown after the reveal. */
  stat?: string;
  /** Spot the Fake: which listing, so every client draws the same card with its real CMHC benchmark. */
  listingId?: string;
  /** Haggle Time: everyone negotiates for this offer at once; the answer is the agreed rent in cents. */
  negotiateOfferId?: string;
  contentId?: string;
}
export interface AnswerKey {
  /** Haggle Time: points come from the rent each player agreed, against this asking rent. */
  askingCents?: number;
  /** Option indexes that score (e.g. "suspicious" also catches a scam). */
  accept: number[];
  correctIndex: number;
  explain: string;
}

const LISTING_OPTIONS = ["Legit", "Suspicious", "Scam"];
const STAGE = STAGES.find((s) => s.journey)! as PlayableStage;

/** The Base sequence of graded questions for a room: 3 listings, move-in, one event (action + level). */
export function roomQuestions(seed: number, difficulty: Difficulty, scenarios: ScenarioMap = {}): { questions: RoomQuestion[]; keys: AnswerKey[] } {
  const plan = planRun(seed, "base");
  const questions: RoomQuestion[] = [];
  const keys: AnswerKey[] = [];
  const push = (q: Omit<RoomQuestion, "index">, k: AnswerKey) => {
    questions.push({ ...q, index: questions.length });
    keys.push(k);
  };
  for (const l of listingsFor(STAGE, difficulty, seed, MODES.base.listings)) {
    const text = fill(scenarios[l.id]?.scenario ?? plan.prose[l.id] ?? l.text, { rent: money(l.rentCents) });
    const correct = ["legit", "suspicious", "scam"].indexOf(l.answer);
    push(
      { round: "search", title: `${l.title} · ${money(l.rentCents)}/mo`, scenario: text, prompt: "Legit, suspicious or scam?", options: LISTING_OPTIONS, stat: `listing:${l.answer}`, listingId: l.id, ...(l.redFlags[0] ? { contentId: l.redFlags[0] } : {}) },
      { accept: l.answer === "scam" ? [1, 2] : [correct], correctIndex: correct, explain: l.answer === "legit" ? "Nothing odd: viewings offered, no money up front." : l.redFlags.map((id) => content(id).short).slice(0, 2).join(" ") },
    );
  }
  // Haggle Time, the flagship: same listing for everyone, each player negotiates with the landlord on their own device.
  const haggle = STAGE.offers.find((o) => o.id === MODES.base.offerIds![0])!;
  push(
    { round: "negotiate", title: haggle.title, scenario: `It's listed at ${money(haggle.rentCents)} a month. Haggle for a better deal!`, prompt: "Make your case to the landlord.", options: [], negotiateOfferId: haggle.id },
    { accept: [], correctIndex: -1, askingCents: haggle.rentCents, explain: "The lower the rent you agree, the more points." },
  );
  const ask = (id: string, round: string, stat: string, title?: string) => {
    const t = template(id);
    const q = plan.questions[id];
    push(
      { round, title: title ?? t.title ?? "", scenario: scenarios[id]?.scenario ?? q.fallback, prompt: t.prompt, options: q.options.map((o) => o.label), stat, contentId: t.content_id },
      { accept: [q.options.findIndex((o) => o.correct)], correctIndex: q.options.findIndex((o) => o.correct), explain: `Answer: ${q.options.find((o) => o.correct)!.label}.` },
    );
  };
  ask(plan.movein, "movein", "movein", "Moving day");
  const ev = plan.events[0];
  ask(ev, "live", `event:${ev}:action`);
  const t = template(ev);
  const levels = J.eventLevels;
  const accept = levels.map((lv, i) => (lv === t.level || lv === t.also_level ? i : -1)).filter((i) => i >= 0);
  push(
    { round: "live", title: t.title ?? "", scenario: "If it isn't sorted, which level can act?", prompt: "Which level of government?", options: levels.map((lv) => J.levels[lv as keyof typeof J.levels]), stat: `event:${ev}:level`, contentId: t.content_id },
    { accept, correctIndex: levels.indexOf(t.level!), explain: t.level_why ?? "" },
  );
  return { questions, keys };
}

/** Ids the host asks the scenario service for (generic: no profile in multiplayer). */
export function roomScenarioIds(seed: number, difficulty: Difficulty): { listings: string[]; questions: string[] } {
  const plan = planRun(seed, "base");
  return { listings: listingsFor(STAGE, difficulty, seed, MODES.base.listings).map((l) => l.id), questions: [plan.movein, plan.events[0]] };
}

/** Haggle Time points, decided by code from the agreed rent: 4 points per dollar saved, capped at 200. */
export function hagglePoints(askingCents: number, agreedCents: number): number {
  return Math.max(0, Math.min(200, Math.round((askingCents - agreedCents) / 100) * 4));
}
