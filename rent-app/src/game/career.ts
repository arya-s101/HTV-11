// Job paths: story text only. Shared by the client (presets, display) and the server (LLM validation).
import professionsJson from "../../data/game/professions.json";
import { STAGES } from "./data";

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
}

export const PRESETS = professionsJson.presets as { id: string; label: string; path: JobPath }[];
export const STAGE_IDS = STAGES.map((s) => s.id);
export const MAX_PROFESSION_CHARS = 40;

export function presetProfession(id: string): Profession {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0];
  return { id: p.id, label: p.label, path: p.path, source: "preset" };
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
