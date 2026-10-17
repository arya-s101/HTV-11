// Stat cards (PRD v3 Change 4): one real, sourced number after an answer. Data: data/stats.json (npm run build:stats).
import statsJson from "../../data/stats.json";
import type { Field } from "./types";

export interface StatCard {
  id: string;
  question_id: string;
  /** Cards with the same group show the same figure; a run shows each group at most once. */
  group: string;
  label: string;
  stat: Field<number> & { value: number; source_url: string };
  stat_label?: string;
  compare_to?: Field<number> & { value: number; source_url: string };
  compare_label?: string;
  verified_by: string;
}

export const STATS = statsJson.cards as StatCard[];

/** The first card for this question whose figure hasn't been shown yet this run; null means no card. */
export function statFor(questionId: string, shownGroups: readonly string[]): StatCard | null {
  return STATS.find((c) => c.question_id === questionId && !shownGroups.includes(c.group)) ?? null;
}

/** Formats a stat value by its unit, e.g. "$2,020/mo", "3.5%", "$638M", "108,878". */
export function formatStat(value: number, unit: string): string {
  const n = (x: number, d = 0) => x.toLocaleString("en-CA", { minimumFractionDigits: d, maximumFractionDigits: d });
  switch (unit) {
    case "CAD cents/month":
      return `$${n(Math.round(value / 100))}/mo`;
    case "CAD cents":
      return `$${n(value / 100, 2)}`;
    case "CAD millions":
      return `$${n(Math.round(value))}M`;
    case "%":
      return `${n(value, Number.isInteger(value) ? 0 : 1)}%`;
    default:
      return n(Math.round(value));
  }
}

/** Unit word shown under the number when the format doesn't already say it. */
export function unitWord(unit: string): string {
  return ["units", "buildings", "trips", "reports", "applications"].includes(unit) ? unit : "";
}
