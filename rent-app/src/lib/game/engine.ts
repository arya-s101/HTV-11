// Game rules: which fictional listings are valid, which one is optimal, scoring and explanations.
// Pure and deterministic; all money in integer cents.
import { formatCents as fmt, ttcMonthlyCost } from "../calc";
import { BEDROOMS, type Bedroom } from "../sources";

/** Housing budget = 30% of gross monthly income, as an exact integer ratio (3/10) to avoid float drift. */
export const BUDGET_SHARE = { numerator: 3, denominator: 10 } as const;
export const POINTS = { optimal: 100, valid: 40, invalid: 0, streakBonus: 20 } as const;

export interface Scenario {
  personName: string;
  annualGrossIncomeCents: number;
  housingBudgetCents: number;
  bedroomsNeeded: Bedroom;
  workId: string;
  workName: string;
  commuteLimitMinutes: number;
  commuteDaysPerMonth: number;
  priority: "money" | "time";
}

export interface Listing {
  id: string;
  title: string;
  neighbourhoodId: number;
  neighbourhoodName: string;
  zoneLabel: string;
  zoneBenchmarkCents: number;
  bedrooms: Bedroom;
  rentCents: number;
  utilitiesIncluded: boolean;
  /** Separately paid utilities per month; 0 when included in rent. */
  utilitiesCents: number;
  commuteMinutes: number;
}

export type Failure = "bedrooms" | "budget" | "commute";

export interface Evaluation {
  listingId: string;
  housingCents: number;
  transportCents: number;
  totalCents: number;
  budgetGapCents: number;
  commuteGapMinutes: number;
  failures: Failure[];
  valid: boolean;
}

export function budgetFromIncome(annualGrossIncomeCents: number): number {
  return Math.floor((annualGrossIncomeCents * BUDGET_SHARE.numerator) / (12 * BUDGET_SHARE.denominator));
}

export function evaluate(s: Scenario, l: Listing): Evaluation {
  const housingCents = l.rentCents + l.utilitiesCents;
  const transportCents = ttcMonthlyCost({ commuteDaysPerMonth: s.commuteDaysPerMonth }).cents;
  const failures: Failure[] = [];
  if (BEDROOMS.indexOf(l.bedrooms) < BEDROOMS.indexOf(s.bedroomsNeeded)) failures.push("bedrooms");
  if (housingCents > s.housingBudgetCents) failures.push("budget");
  if (l.commuteMinutes > s.commuteLimitMinutes) failures.push("commute");
  return {
    listingId: l.id,
    housingCents,
    transportCents,
    totalCents: housingCents + transportCents,
    budgetGapCents: housingCents - s.housingBudgetCents,
    commuteGapMinutes: l.commuteMinutes - s.commuteLimitMinutes,
    failures,
    valid: failures.length === 0,
  };
}

/** Negative when a is better than b under the scenario's priority. */
export function compare(s: Scenario, a: Evaluation & { minutes: number }, b: Evaluation & { minutes: number }): number {
  return s.priority === "money"
    ? a.housingCents - b.housingCents || a.minutes - b.minutes
    : a.minutes - b.minutes || a.housingCents - b.housingCents;
}

export function ranked(s: Scenario, listings: Listing[]) {
  return listings
    .map((l) => ({ ...evaluate(s, l), minutes: l.commuteMinutes }))
    .filter((e) => e.valid)
    .sort((a, b) => compare(s, a, b));
}

export function optimalId(s: Scenario, listings: Listing[]): string | null {
  return ranked(s, listings)[0]?.listingId ?? null;
}

const BEDROOM_LABEL: Record<Bedroom, string> = { studio: "studio", "1br": "1-bedroom", "2br": "2-bedroom", "3br+": "3+ bedroom" };
export const bedroomLabel = (b: Bedroom) => BEDROOM_LABEL[b];

export function failureText(s: Scenario, l: Listing, e: Evaluation, f: Failure): string {
  switch (f) {
    case "bedrooms":
      return `It's a ${bedroomLabel(l.bedrooms)}, but ${s.personName} needs at least a ${bedroomLabel(s.bedroomsNeeded)}.`;
    case "budget":
      return l.utilitiesIncluded
        ? `Rent ${fmt(l.rentCents)} (utilities included) is ${fmt(e.budgetGapCents)} over the ${fmt(s.housingBudgetCents)} budget.`
        : `Rent ${fmt(l.rentCents)} + ${fmt(l.utilitiesCents)} utilities = ${fmt(e.housingCents)}/month, ${fmt(e.budgetGapCents)} over the ${fmt(s.housingBudgetCents)} budget.`;
    case "commute":
      return `The commute to ${s.workName} is ${l.commuteMinutes} min, ${e.commuteGapMinutes} min over the ${s.commuteLimitMinutes}-minute limit.`;
  }
}

function shortFailure(s: Scenario, l: Listing, e: Evaluation, f: Failure): string {
  if (f === "bedrooms") return `it's a ${bedroomLabel(l.bedrooms)}, not a ${bedroomLabel(s.bedroomsNeeded)}`;
  if (f === "budget") return `${l.utilitiesIncluded ? "it" : "with utilities it"} is ${fmt(e.budgetGapCents)} over budget`;
  return `the commute is ${e.commuteGapMinutes} min over the limit`;
}

const joinAnd = (xs: string[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Does this listing look better than the winner at first glance (lower rent, or faster when time matters)? */
export function isLure(s: Scenario, best: Listing, l: Listing): boolean {
  return s.priority === "money" ? l.rentCents < best.rentCents : l.commuteMinutes < best.commuteMinutes;
}

function whyBest(s: Scenario, best: Listing, bestE: Evaluation, others: { l: Listing; e: Evaluation }[]): string[] {
  const commute = bestE.commuteGapMinutes === 0 ? "exactly at the limit" : `${-bestE.commuteGapMinutes} min under the limit`;
  const lines = [
    `${best.title} meets every rule: ${bedroomLabel(best.bedrooms)}, ${fmt(bestE.housingCents)}/month housing (${fmt(-bestE.budgetGapCents)} under budget), ${best.commuteMinutes}-minute commute (${commute}).`,
  ];
  const validOthers = others.filter((o) => o.e.valid);
  if (validOthers.length === 0) lines.push("It's the only listing that passes all three rules.");
  for (const o of validOthers) lines.push(compareLine(s, best, bestE, o.l, o.e));
  for (const o of others.filter((o) => !o.e.valid && isLure(s, best, o.l))) {
    const looks = s.priority === "money" ? `has lower rent (${fmt(o.l.rentCents)})` : `has a shorter commute (${o.l.commuteMinutes} min)`;
    lines.push(`${o.l.title} ${looks}, but ${joinAnd(o.e.failures.map((f) => shortFailure(s, o.l, o.e, f)))}.`);
  }
  return lines;
}

function compareLine(s: Scenario, best: Listing, bestE: Evaluation, l: Listing, e: Evaluation): string {
  const dollars = e.housingCents - bestE.housingCents;
  const mins = l.commuteMinutes - best.commuteMinutes;
  const hoursPerMonth = Math.round((mins * 2 * s.commuteDaysPerMonth) / 6) / 10;
  if (s.priority === "money") {
    return dollars > 0
      ? `${l.title} also passes, but costs ${fmt(dollars)}/month more (${fmt(dollars * 12)}/year).`
      : `${l.title} costs the same, but its commute is ${mins} min longer each way.`;
  }
  return mins > 0
    ? `${l.title} also passes, but its commute is ${mins} min longer each way (about ${hoursPerMonth} hours/month).`
    : `${l.title} is equally fast but costs ${fmt(dollars)}/month more.`;
}

export interface PickResult {
  correct: boolean;
  valid: boolean;
  points: number;
  basePoints: number;
  streakBonus: number;
  newStreak: number;
  pickedId: string;
  optimalId: string;
  headline: string;
  whyPickWrong: string[];
  whyOptimal: string[];
  breakdown: { listingId: string; title: string; housingCents: number; commuteMinutes: number; valid: boolean; optimal: boolean; failures: Failure[]; reasons: string[] }[];
  notes: string[];
}

export function judge(s: Scenario, listings: Listing[], pickedId: string, streak: number): PickResult {
  const best = optimalId(s, listings);
  const picked = listings.find((l) => l.id === pickedId);
  if (!best) throw new Error("Round has no valid listing");
  if (!picked) throw new Error(`Unknown listing ${pickedId}`);
  const evals = new Map(listings.map((l) => [l.id, evaluate(s, l)]));
  const bestL = listings.find((l) => l.id === best)!;
  const bestE = evals.get(best)!;
  const pickedE = evals.get(pickedId)!;

  const correct = pickedId === best;
  const basePoints = correct ? POINTS.optimal : pickedE.valid ? POINTS.valid : POINTS.invalid;
  const newStreak = correct ? streak + 1 : 0;
  const streakBonus = correct ? POINTS.streakBonus * streak : 0;

  const whyPickWrong: string[] = [];
  if (!correct) {
    if (!pickedE.valid) whyPickWrong.push(...pickedE.failures.map((f) => failureText(s, picked, pickedE, f)));
    else whyPickWrong.push(compareLine(s, bestL, bestE, picked, pickedE));
  }

  const others = listings.filter((l) => l.id !== best).map((l) => ({ l, e: evals.get(l.id)! }));
  const transport = ttcMonthlyCost({ commuteDaysPerMonth: s.commuteDaysPerMonth });

  return {
    correct,
    valid: pickedE.valid,
    points: basePoints + streakBonus,
    basePoints,
    streakBonus,
    newStreak,
    pickedId,
    optimalId: best,
    headline: correct
      ? `Correct! ${bestL.title} is the best choice.`
      : pickedE.valid
        ? `Close: ${picked.title} works, but it isn't the best choice.`
        : `Not quite: ${picked.title} breaks ${pickedE.failures.length === 1 ? "a rule" : `${pickedE.failures.length} rules`}.`,
    whyPickWrong,
    whyOptimal: whyBest(s, bestL, bestE, others),
    breakdown: listings.map((l) => {
      const e = evals.get(l.id)!;
      return {
        listingId: l.id,
        title: l.title,
        housingCents: e.housingCents,
        commuteMinutes: l.commuteMinutes,
        valid: e.valid,
        optimal: l.id === best,
        failures: e.failures,
        reasons: e.valid ? ["Passes all rules"] : e.failures.map((f) => failureText(s, l, e, f)),
      };
    }),
    notes: [
      `TTC fares are the same for every listing: ${fmt(transport.cents)}/month (${transport.chargedFares} trips at $3.30, 47-fare monthly cap), so they never change the answer.`,
    ],
  };
}
