// Deterministic round generator. Same (seed, round) always yields the same scenario and listings, so the
// server can re-derive the answer without storing state. Listings are FICTIONAL; their rents are drawn near
// the real CMHC Oct 2025 zone benchmark and their commute times are the real r5py scheduled TTC times.
import { BEDROOMS, type Bedroom, type SourceData } from "../sources";
import { budgetFromIncome, evaluate, isLure, POINTS, ranked, type Listing, type Scenario } from "./engine";

export const ROUNDS_PER_GAME = 5;
export const LISTINGS_PER_ROUND = 6;
const MAX_ATTEMPTS = 400;
const MONEY_MARGIN_CENTS = 4_000;
const TIME_MARGIN_MINUTES = 4;

const NAMES = ["Priya", "Marcus", "Aisha", "Daniel", "Mei", "Omar", "Sofia", "Jordan", "Tariq", "Elena", "Kwame", "Hana", "Luis", "Noor", "Sam", "Ines"];
const STREET_WORDS = ["Maple", "Birch", "Harbour", "Elm", "Cedar", "Willow", "Oak", "Juniper", "Ash", "Linden", "Spruce", "Poplar"];
const KINDS: Record<Bedroom, string[]> = {
  studio: ["Bright studio", "Compact studio", "Studio apartment"],
  "1br": ["1-bed apartment", "Cozy 1-bedroom", "1-bed in low-rise"],
  "2br": ["2-bed apartment", "Spacious 2-bedroom", "2-bed walk-up"],
  "3br+": ["3-bed apartment", "Family 3-bedroom", "3-bed upper unit"],
};
const UTILITY_RANGE: Record<Bedroom, [number, number]> = { studio: [60, 120], "1br": [70, 140], "2br": [90, 180], "3br+": [110, 220] };

/** mulberry32 seeded from a string hash. */
export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Round {
  seed: string;
  round: number;
  scenario: Scenario;
  listings: Listing[];
  optimalId: string;
}

interface Place {
  id: number;
  name: string;
  zoneLabel: string;
  minutes: number;
  benchmark: (b: Bedroom) => number | null;
}

export function generateRound(seed: string, round: number, data: SourceData): Round {
  const r = rng(`${seed}:${round}`);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const between = (lo: number, hi: number) => lo + r() * (hi - lo);
  const zones = new Map(data.cmhc.zones.map((z) => [z.zoneCode, z]));

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const work = pick(data.travel.destinations);
    const bedroomsNeeded = pick<Bedroom>(["studio", "1br", "1br", "2br"]);
    const commuteLimitMinutes = pick([35, 40, 45, 50, 60]);
    const priority = r() < 0.6 ? "money" : "time";
    const minutes = data.travel.minutes[work.id];

    const places: Place[] = data.neighbourhoods.neighbourhoods.flatMap((n) => {
      const z = n.zoneCode ? zones.get(n.zoneCode) : undefined;
      const m = minutes[String(n.id)];
      if (!z || !m) return [];
      return [{ id: n.id, name: n.name, zoneLabel: z.zoneLabel, minutes: m[1], benchmark: (b: Bedroom) => z.benchmarks[b].vacant.valueCents }];
    });
    const near = places.filter((p) => p.minutes <= commuteLimitMinutes && p.benchmark(bedroomsNeeded) !== null);
    const far = places.filter((p) => p.minutes > commuteLimitMinutes && p.minutes <= commuteLimitMinutes + 45);
    if (near.length < 3 || far.length < 2) continue;

    // Income puts the 30% budget near a typical nearby benchmark, so the budget actually bites.
    const anchor = pick(near).benchmark(bedroomsNeeded)!;
    const annualGrossIncomeCents = Math.round((anchor * between(1.0, 1.12) * 12) / 0.3 / 100_000) * 100_000;
    const scenario: Scenario = {
      personName: pick(NAMES),
      annualGrossIncomeCents,
      housingBudgetCents: budgetFromIncome(annualGrossIncomeCents),
      bedroomsNeeded,
      workId: work.id,
      workName: work.name,
      commuteLimitMinutes,
      commuteDaysPerMonth: pick([16, 20, 22]),
      priority,
    };

    const used = new Set<number>();
    const listings: Listing[] = [];
    for (let i = 0; i < LISTINGS_PER_ROUND * 3 && listings.length < LISTINGS_PER_ROUND; i++) {
      const place = pick(r() < 0.6 ? near : far);
      if (used.has(place.id)) continue;
      const needIdx = BEDROOMS.indexOf(bedroomsNeeded);
      const roll = r();
      const bedIdx = roll < 0.2 && needIdx > 0 ? needIdx - 1 : roll > 0.88 && needIdx < 3 ? needIdx + 1 : needIdx;
      const bedrooms = BEDROOMS[bedIdx];
      const benchmark = place.benchmark(bedrooms);
      if (benchmark === null) continue;
      used.add(place.id);
      const included = r() < 0.45;
      const [ulo, uhi] = UTILITY_RANGE[bedrooms];
      listings.push({
        id: `L${listings.length + 1}`,
        title: `${pick(KINDS[bedrooms])} on ${pick(STREET_WORDS)} St`,
        neighbourhoodId: place.id,
        neighbourhoodName: place.name,
        zoneLabel: place.zoneLabel,
        zoneBenchmarkCents: benchmark,
        bedrooms,
        rentCents: Math.round((benchmark * between(0.82, 1.15)) / 2_500) * 2_500,
        utilitiesIncluded: included,
        utilitiesCents: included ? 0 : Math.round(between(ulo, uhi) / 5) * 500,
        commuteMinutes: place.minutes,
      });
    }
    if (listings.length < LISTINGS_PER_ROUND) continue;
    if (new Set(listings.map((l) => l.title)).size < listings.length) continue;

    if (isInteresting(scenario, listings)) {
      return { seed, round, scenario, listings, optimalId: ranked(scenario, listings)[0].listingId };
    }
  }
  throw new Error(`Could not generate an interesting round for ${seed}:${round}`);
}

/** One clear winner, more than one way to fail, and at least one lure that looks better at first glance. */
export function isInteresting(s: Scenario, listings: Listing[]): boolean {
  const valid = ranked(s, listings);
  if (valid.length < 1 || valid.length > 3) return false;
  if (valid.length > 1) {
    const [a, b] = valid;
    const margin = s.priority === "money" ? b.housingCents - a.housingCents >= MONEY_MARGIN_CENTS : b.minutes - a.minutes >= TIME_MARGIN_MINUTES;
    if (!margin) return false;
  }
  const best = listings.find((l) => l.id === valid[0].listingId)!;
  const failureKinds = new Set(listings.flatMap((l) => evaluate(s, l).failures));
  const hasTrap = listings.some((l) => l.id !== best.id && isLure(s, best, l));
  return failureKinds.size >= 2 && hasTrap;
}

/** What the browser may see before answering: no optimal id. */
export function publicRound(r: Round) {
  return { seed: r.seed, round: r.round, totalRounds: ROUNDS_PER_GAME, points: POINTS, scenario: r.scenario, listings: r.listings };
}
