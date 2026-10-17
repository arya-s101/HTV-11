// Fresh questions every game (PRD v4 Change 2). Code picks templates, the correct answer, distractors and their
// order from data/game/questions.json with a per-game seed; Gemini may only rewrite the scenario around them.
import questionsJson from "../../data/game/questions.json";
import type { Mode } from "../config/modes";
import { MODES } from "../config/modes";
import { rng } from "./journey";
import type { Feature, Scenario, ScenarioSpec } from "./scenario";

export interface QuestionTemplate {
  id: string;
  content_id: string;
  round: string;
  prompt: string;
  scenario_brief: string;
  correct_variants: string[];
  distractors: string[];
  fallback_scenarios: string[];
  reviewed_by: string;
  title?: string;
  level?: string;
  also_level?: string;
  level_why?: string;
  extra_content_ids?: string[];
  civic?: string;
  base?: boolean;
  photos_matter?: { with: string; without: string };
  insurance?: boolean;
  receipt?: string;
  /** Asked first when the player said this applies to them (e.g. newcomer). Never set from identity. */
  profile_flag?: "newcomer";
  /** Shown with the answer, e.g. "General information, not legal advice." */
  disclaimer?: string;
}
export interface ProseTemplate {
  scenario_brief: string;
  required_features: Feature[];
  fallback_scenarios: string[];
  content_ids?: string[];
  reviewed_by: string;
}

export const TEMPLATES = questionsJson.questions as QuestionTemplate[];
export const LISTING_PROSE = questionsJson.listings as Record<string, ProseTemplate>;
export const OFFER_PROSE = questionsJson.offers as Record<string, ProseTemplate>;
export const PLACEHOLDERS = questionsJson.placeholders;
export const template = (id: string) => {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t) throw new Error(`Unknown question template ${id}`);
  return t;
};

const OPTIONS_PER_QUESTION = 4;

export interface Option {
  id: string;
  label: string;
  correct: boolean;
}
export interface PlannedQuestion {
  id: string;
  options: Option[];
  /** Reviewed fallback scenario for this game; replaced by a validated Gemini scenario when one arrives. */
  fallback: string;
}
export interface RunPlan {
  seed: number;
  viewing: string[];
  movein: string;
  scamReport: string;
  events: string[];
  moveout: string;
  questions: Record<string, PlannedQuestion>;
  /** Reviewed listing/offer prose per id for this game. */
  prose: Record<string, string>;
}

/** Same salted sub-seed scheme as journey.ts, so one round's draw never changes another's. */
const sub = (seed: number, salt: string) => {
  let h = seed >>> 0;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return h;
};
function shuffle<T>(xs: readonly T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** Picks n from a pool, preferring ids not seen in recent games, in a seeded order. */
function pickFresh(pool: string[], n: number, recent: Set<string>, r: () => number): string[] {
  const order = shuffle(pool, r);
  return [...order.filter((id) => !recent.has(id)), ...order.filter((id) => recent.has(id))].slice(0, n);
}

/** Answer options: one reviewed correct variant plus reviewed distractors, shuffled. Gemini never writes these. */
export function optionsFor(t: QuestionTemplate, seed: number): Option[] {
  const r = rng(sub(seed, `opts:${t.id}`));
  const correct = t.correct_variants[Math.floor(r() * t.correct_variants.length)];
  const wrong = shuffle(t.distractors, r).slice(0, OPTIONS_PER_QUESTION - 1);
  return shuffle(
    [{ id: "c", label: correct, correct: true }, ...wrong.map((label, i) => ({ id: `d${i}`, label, correct: false }))],
    r,
  );
}

export function planRun(seed: number, mode: Mode, recent: string[] = [], exclude: string[] = [], flags: { newcomer?: boolean } = {}): RunPlan {
  const cfg = MODES[mode];
  const seen = new Set(recent);
  const ofRound = (round: string) => TEMPLATES.filter((t) => t.round === round && !exclude.includes(t.id)).map((t) => t.id);
  const viewingPool = ofRound("viewing");
  // A stated situation (e.g. "newcomer to Canada") brings its reviewed question forward; everyone else may still draw it.
  const flagged = viewingPool.filter((id) => flags.newcomer && template(id).profile_flag === "newcomer");
  const viewing = cfg.viewingQuestions
    ? [...flagged, ...pickFresh(viewingPool.filter((id) => !flagged.includes(id)), cfg.viewingQuestions - flagged.length, seen, rng(sub(seed, "plan:viewing")))]
    : [];
  const movein = pickFresh(ofRound("movein"), 1, seen, rng(sub(seed, "plan:movein")))[0];
  const scamReport = ofRound("search")[0];
  const eventPool = mode === "base" ? TEMPLATES.filter((t) => t.round === "live" && t.base && !exclude.includes(t.id)).map((t) => t.id) : ofRound("live");
  const events = pickFresh(eventPool, typeof cfg.events === "number" ? cfg.events : 1, seen, rng(sub(seed, "plan:events")));
  const moveout = ofRound("moveout")[0];
  const ids = [...viewing, movein, scamReport, ...events, moveout].filter(Boolean);
  const questions: Record<string, PlannedQuestion> = {};
  for (const id of ids) {
    const t = template(id);
    const r = rng(sub(seed, `fallback:${id}`));
    questions[id] = { id, options: optionsFor(t, seed), fallback: t.fallback_scenarios[Math.floor(r() * t.fallback_scenarios.length)] };
  }
  const prose: Record<string, string> = {};
  for (const [id, p] of [...Object.entries(LISTING_PROSE), ...Object.entries(OFFER_PROSE)]) {
    prose[id] = p.fallback_scenarios[Math.floor(rng(sub(seed, `prose:${id}`))() * p.fallback_scenarios.length)];
  }
  return { seed, viewing, movein, scamReport, events, moveout, questions, prose };
}

/** Template ids a plan uses, for the "recently seen" list. */
export const planIds = (p: RunPlan) => Object.keys(p.questions);

// ---------- recent games (variety without repetition) ----------
const RECENT_KEY = "trd.recentTemplates";
export function loadRecent(): string[] {
  try {
    const games = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(games) ? games.flat().filter((x: unknown) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
export function rememberGame(ids: string[]) {
  try {
    const games = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    const next = [ids, ...(Array.isArray(games) ? games : [])].slice(0, 3);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // not remembered
  }
}

// ---------- what the scenario service may write ----------
export type ScenarioKind = "question" | "listing" | "offer";
export interface ScenarioRequestItem {
  id: string;
  kind: ScenarioKind;
}

/** The validation spec for one item: which placeholders, which features, how long. */
export function specFor(item: ScenarioRequestItem, allowPlace: boolean): ScenarioSpec {
  if (item.kind === "question") return { placeholders: allowPlace ? ["place", "work"] : ["work"], maxSentences: 2 };
  const p = item.kind === "listing" ? LISTING_PROSE[item.id] : OFFER_PROSE[item.id];
  return { placeholders: ["rent"], features: p?.required_features ?? [], maxSentences: 3 };
}
export function briefFor(item: ScenarioRequestItem): string | null {
  if (item.kind === "question") return TEMPLATES.find((t) => t.id === item.id)?.scenario_brief ?? null;
  return (item.kind === "listing" ? LISTING_PROSE[item.id] : OFFER_PROSE[item.id])?.scenario_brief ?? null;
}

export type ScenarioMap = Record<string, Scenario>;

/** Level-of-government answers come from the reviewed template, never from Gemini. */
export function levelCorrect(t: QuestionTemplate, picked: string): boolean {
  return picked === t.level || picked === t.also_level;
}
