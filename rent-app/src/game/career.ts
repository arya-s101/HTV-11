// Job paths and preset work details. Shared by the client (presets, display) and the server (LLM validation).
// Story text may come from an LLM; income and trips come only from handwritten presets (PRD §5).
import professionsJson from "../../data/game/professions.json";
import { monthlyIncomeCents } from "./calc";
import { STAGES } from "./data";
import { stageForAge } from "./life";
import type { PlayableStage, WorkDetails } from "./types";

export interface PathStep {
  title: string;
  blurb: string;
}

export type JobPath = Record<string, PathStep>;

export interface Profession {
  id: string; // preset id, or "custom"
  label: string;
  path: JobPath;
  source: "preset" | "llm" | "template";
  /** Per-stage income and commute days. Presets only; custom professions use the stage defaults. */
  work?: Record<string, WorkDetails>;
}

export const PRESETS = professionsJson.presets as { id: string; label: string; path: JobPath; work: Record<string, WorkDetails> }[];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const MAX_PROFESSION_CHARS = 40;

export function presetProfession(id: string): Profession {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { id: p.id, label: p.label, path: p.path, source: "preset", work: p.work };
}

/** The stage as this profession lives it: preset income and commute days replace the defaults; nothing else changes. */
export function stageForProfession(stage: PlayableStage, profession: Profession): PlayableStage {
  const w = profession.source === "preset" ? profession.work?.[stage.id] : undefined;
  if (!w) return stage;
  return { ...stage, income: w.income, commuteDaysPerMonth: w.commuteDaysPerMonth };
}

/** Rough monthly pay for this job at this age. Presets only; a custom job uses the stage default. */
export function estimateMonthly(profession: Profession, age: number): { cents: number; basis: "gross" | "net"; note: string } {
  const stageId = stageForAge(age).id;
  const w = profession.source === "preset" ? (profession.work?.[stageId] ?? profession.work?.["first-job"]) : undefined;
  if (w) return { cents: monthlyIncomeCents(w.income), basis: w.income.basis, note: w.income.description };
  const fallback = STAGES.find((s) => s.id === "first-job")?.income;
  if (!fallback) return { cents: 0, basis: "gross", note: "no estimate" };
  return { cents: monthlyIncomeCents(fallback), basis: fallback.basis, note: fallback.description };
}

/** Profession pay, then the player's own monthly amount if they moved the slider. */
export function livedStage(stage: PlayableStage, who: { profession: Profession; monthlyIncomeCents?: number }): PlayableStage {
  const s = stageForProfession(stage, who.profession);
  if (who.monthlyIncomeCents == null || who.monthlyIncomeCents <= 0) return s;
  return {
    ...s,
    income: {
      ...s.income,
      amountCents: who.monthlyIncomeCents,
      period: "monthly",
      description: `monthly amount you set, starting from the ${who.profession.label} estimate`,
    },
  };
}

const BLOCKED = /\b(sex|porn|drug dealer|hitman|terroris\w*|nazi|kill\w*|murder\w*|escort|stripper|scam\w*|fuck\w*|shit\w*)\b/i;

/** Accepts letters, spaces and a few separators; returns a tidy string or null when it isn't a plausible job name. */
export function cleanProfession(raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > MAX_PROFESSION_CHARS) return null;
  if (!/^[\p{L}][\p{L} &/'.-]*$/u.test(s)) return null;
  if (BLOCKED.test(s)) return null;
  return s;
}

const article = (w: string) => (/^[aeiou]/i.test(w) ? "an" : "a");

/** Deterministic fallback for a custom profession when no model is available. */
export function templatePath(profession: string): JobPath {
  const p = profession.toLowerCase();
  return {
    student: { title: `Training to be ${article(p)} ${p}`, blurb: `Classes and placements on the way to becoming ${article(p)} ${p}.` },
    "first-job": { title: `Junior ${p}`, blurb: "First full-time job in the field, near downtown." },
    "new-job": { title: `Experienced ${p}`, blurb: "Took a new role somewhere else in the city." },
    partner: { title: `Senior ${p}`, blurb: "Settled in the career and planning a home for two." },
    kids: { title: `Lead ${p}`, blurb: "Leading others while making room for family." },
    retirement: { title: `Retired ${p}`, blurb: "Shares what they learned with people starting out." },
  };
}

const FORBIDDEN_IN_TEXT = /[\d$€£%]|https?:|www\.|\b(salary|income|wage|paid|earn\w*|dollars?|thousand|million|k a year)\b/i;

/** Validates model output: every stage present, short plain text, and no numbers or money talk (PRD: AI never creates figures). */
export function validatePath(raw: unknown): JobPath | null {
  const o = raw as { valid?: boolean; stages?: { stage_id?: string; title?: string; blurb?: string }[] } | null;
  if (!o || o.valid === false || !Array.isArray(o.stages)) return null;
  const path: JobPath = {};
  for (const st of o.stages) {
    if (!st || typeof st.stage_id !== "string" || !STAGE_IDS.includes(st.stage_id)) continue;
    const title = String(st.title ?? "").trim();
    const blurb = String(st.blurb ?? "").trim();
    if (!title || title.length > 48 || !blurb || blurb.length > 140) return null;
    if (FORBIDDEN_IN_TEXT.test(title) || FORBIDDEN_IN_TEXT.test(blurb) || BLOCKED.test(title) || BLOCKED.test(blurb)) return null;
    path[st.stage_id] = { title, blurb };
  }
  return STAGE_IDS.every((id) => path[id]) ? path : null;
}
