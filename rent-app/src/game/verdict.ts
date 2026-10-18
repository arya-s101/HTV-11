// End-of-game explanation of the place the player picked: three checks backed by real Toronto data, then a verdict.
// Pure and deterministic. It explains; it never scores (the score stays skill-only, never money-vs-commute choices).
import { evidenceFor } from "./data";
import { belowBenchmark } from "./journey";
import { money, type Consequence } from "./outcome";
import { STATS } from "./stats";
import type { Field, Offer, VerifyItemId } from "./types";

export type Grade = "great" | "okay" | "risky";
export type CheckId = "afford" | "price" | "surprise";

export interface Check {
  id: CheckId;
  title: string;
  good: boolean;
  /** Passed, with a caution (housing cost between the 30% line and STRETCH_PCT). */
  tight?: boolean;
  /** At most 3 lines of at most 15 words (game-show text rule); these are read aloud. */
  lines: string[];
  /** Numbers shown as counters, each a Field with its status and source. */
  stats: { label: string; value: number; unit: "%" | "cents"; f: Omit<Field<number>, "value" | "unit"> }[];
}

export interface PlaceVerdict {
  grade: Grade;
  headline: string;
  lines: string[];
  checks: Check[];
}

/** The usual affordability line: shelter costs at 30% or more of income (the Census measure the stat cards use). */
export const AFFORDABLE_PCT = 30;
/** Above this share of income, housing is a stretch; between the two it's tight. */
export const STRETCH_PCT = 40;
/** Rent within this share above the CMHC area average still counts as fair. */
const FAIR_ABOVE = 0.05;

const CHECK_NAMES: Record<CheckId, string> = { afford: "affordability", price: "price", surprise: "the hidden surprise" };

/** Citywide share of tenant households at 30%+, from the same Census table as the neighbourhood figure. */
function cityTenant30() {
  return STATS.find((c) => c.group.startsWith("tenant30:"))?.compare_to ?? null;
}

const SCENARIO = { geography: "Fictional scenario", reference_period: "2026 dollars", source_url: null };
const pct = (x: number) => Math.round(x * 10) / 10;

export function placeVerdict(c: Consequence, offer: Offer, verify: readonly VerifyItemId[], utilitiesNegotiated = false): PlaceVerdict {
  const ev = evidenceFor(offer.neighbourhoodId);
  const checks: Check[] = [];

  // 1. Affordability: what housing takes from income, against the 30% line, with the neighbourhood's real share.
  const burden = c.housingBurdenPct ?? c.rentBurdenPct;
  if (burden !== null) {
    const tight = burden > AFFORDABLE_PCT && burden <= STRETCH_PCT;
    const good = burden <= STRETCH_PCT;
    const nb = ev.tenantShelter30;
    const city = cityTenant30();
    const what = c.housingBurdenPct !== null ? "Rent and utilities take" : "Rent takes";
    checks.push({
      id: "afford",
      title: tight ? "Tight budget" : good ? "Affordable" : "A stretch",
      good,
      tight,
      lines: [
        `${what} ${pct(burden)}% of your income.`,
        tight
          ? `That's over the usual ${AFFORDABLE_PCT}% line, but under ${STRETCH_PCT}%.`
          : good
            ? `That's under the usual ${AFFORDABLE_PCT}% affordability line.`
            : `That's well over the usual ${AFFORDABLE_PCT}% affordability line.`,
        ...(nb.value !== null ? [`In ${ev.name}, ${nb.value}% of tenant households pay ${AFFORDABLE_PCT}% or more.`] : []),
      ],
      stats: [
        { label: "Share of your income", value: pct(burden), unit: "%", f: { ...SCENARIO, status: "derived" } },
        ...(nb.value !== null ? [{ label: `Tenants at ${AFFORDABLE_PCT}%+ in ${ev.name}`, value: nb.value, unit: "%" as const, f: nb }] : []),
        ...(city ? [{ label: `Tenants at ${AFFORDABLE_PCT}%+ in Toronto`, value: city.value, unit: "%" as const, f: city }] : []),
      ],
    });
  }

  // 2. Price: the rent paid against CMHC's average for vacant units of this size in the area's survey zone.
  const bench = ev.cmhcRent[offer.cmhcBedroom];
  const below = belowBenchmark(c.offer.rentCents, bench?.value ?? null);
  if (bench && bench.value !== null && below !== null) {
    const good = below >= -FAIR_ABOVE;
    const off = Math.abs(Math.round(below * 100));
    checks.push({
      id: "price",
      title: good ? (below > 0 ? "Good value" : "Fair price") : "Pricey",
      good,
      lines: [
        `You pay ${money(c.offer.rentCents)} a month.`,
        `The CMHC average for vacant units here is ${money(bench.value)}.`,
        below > 0 ? `That's ${off}% below the area average.` : off <= 1 ? "That's right on the area average." : `That's ${off}% above the area average.`,
      ],
      stats: [
        { label: "Your rent", value: c.offer.rentCents, unit: "cents", f: { ...SCENARIO, status: "illustrative" } },
        { label: "Area average (CMHC)", value: bench.value, unit: "cents", f: bench },
      ],
    });
  }

  // 3. The surprise: did the player flag the thing this place was hiding before choosing?
  const covered = offer.reveal.id === "utilities" && utilitiesNegotiated;
  const flagged = verify.includes(offer.reveal.id);
  checks.push({
    id: "surprise",
    title: flagged ? "Surprise spotted" : covered ? "Surprise covered" : "Surprise missed",
    good: flagged || covered,
    lines: [
      offer.reveal.lines[0],
      flagged ? "You flagged it before choosing. Well spotted!" : covered ? "You haggled it into the rent, so it's covered." : "You didn't flag it before choosing.",
      ...(flagged || covered ? [] : ["Next time, ask before you sign."]),
    ],
    stats:
      offer.reveal.extraMonthlyCents > 0 && !covered
        ? [{ label: "Extra each month", value: offer.reveal.extraMonthlyCents, unit: "cents", f: { ...SCENARIO, status: "illustrative" } }]
        : [],
  });

  const missed = checks.filter((x) => !x.good);
  const grade: Grade = missed.length === 0 ? "great" : missed.length === 1 ? "okay" : "risky";
  const headline = grade === "great" ? "Great pick!" : grade === "okay" ? "Okay pick" : "Risky pick";
  const names = missed.map((x) => CHECK_NAMES[x.id]);
  const lines = [
    `${checks.length - missed.length} of ${checks.length} checks passed.`,
    missed.length ? `Watch out for ${names.join(" and ")}.` : checks.some((x) => x.tight) ? "Fairly priced and no surprise missed, but money is tight." : "Affordable, fairly priced, and no surprise missed.",
    "Every place has tradeoffs. Ask before you sign.",
  ];
  return { grade, headline, lines, checks };
}
