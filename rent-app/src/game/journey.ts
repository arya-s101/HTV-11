// Stage 2 rental journey (PRD v2 §5.3): pure, seeded logic for the eight phases and the report card.
// Fictional content lives in data/game/journey.json; every teaching point links to a sourced ContentItem.
import contentJson from "../../data/game/content.json";
import journeyJson from "../../data/game/journey.json";
import { MODES, type ModeConfig } from "../config/modes";
import { evidenceFor } from "./data";
import type { Difficulty, PlayableStage } from "./types";

// ---------- content ----------
export interface ContentItem {
  id: string;
  phase: number;
  claim: string;
  /** On-screen line, at most 15 words, same meaning as the claim (PRD v2 §8). */
  short: string;
  jurisdiction: "personal" | "landlord" | "city" | "province" | "federal" | "shared";
  contact?: string;
  source_title: string;
  source_url: string;
  retrieved: string;
  verified_by: string;
}
export const CONTENT = contentJson.items as ContentItem[];
export const CONTENT_DISCLAIMER = contentJson.disclaimer;
export function content(id: string): ContentItem {
  const c = CONTENT.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown content ${id}`);
  return c;
}

export const J = journeyJson;
export type Level = keyof typeof journeyJson.levels;

// ---------- seeded RNG ----------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(xs: T[], r: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
/** A sub-seed per phase, so one phase's choices don't change another's draw. */
const sub = (seed: number, salt: string) => {
  let h = seed >>> 0;
  for (const ch of salt) h = Math.imul(h ^ ch.charCodeAt(0), 2654435761) >>> 0;
  return h;
};
export const DEMO_SEED = 2026;
export const newSeed = () => Math.floor(Math.random() * 1_000_000) + 1;

// ---------- phase 1: search ----------
export type Flag = "legit" | "suspicious" | "scam";
export type ListingVerdict = "correct" | "caught" | "missed" | "false-alarm";

export interface Listing {
  id: string;
  answer: Flag;
  offerId?: string;
  title: string;
  neighbourhoodId: number;
  cmhcBedroom: string;
  rentCents: number;
  text: string;
  redFlags: string[];
  benchmarkCents: number | null;
}

export function listingsFor(stage: PlayableStage, d: Difficulty, seed: number, per: ModeConfig["listings"] = MODES.extended.listings): Listing[] {
  const list = J.listings.map((l) => {
    const offer = l.offerId ? stage.offers.find((o) => o.id === l.offerId) : undefined;
    const base = offer
      ? {
          title: offer.title,
          neighbourhoodId: offer.neighbourhoodId,
          cmhcBedroom: offer.cmhcBedroom,
          rentCents: offer.rentCents,
          text:
            d === "easy"
              ? `${offer.utilities.includedInRent ? "Utilities included" : "Hydro extra"}. About ${offer.commuteMinutes} minutes to work by TTC. Viewings any evening.`
              : d === "normal"
                ? offer.presentation.listingText
                : `${offer.presentation.finePrint} Viewings by appt.`,
        }
      : {
          title: l.title!,
          neighbourhoodId: l.neighbourhoodId!,
          cmhcBedroom: l.cmhcBedroom!,
          rentCents: l.rentCents!,
          text: l.text![d],
        };
    const ev = evidenceFor(base.neighbourhoodId);
    return { id: l.id, answer: l.answer as Flag, offerId: l.offerId, redFlags: l.redFlags, benchmarkCents: ev.cmhcRent[base.cmhcBedroom]?.value ?? null, ...base };
  });
  // A run shows a few legit listings and a few bad ones, always including at least one scam.
  const r = rng(sub(seed, "search"));
  const legit = shuffle(list.filter((l) => l.answer === "legit"), r).slice(0, per.legit);
  const bad = shuffle(list.filter((l) => (per.scamsOnly ? l.answer === "scam" : l.answer !== "legit")), r);
  const firstScam = bad.find((l) => l.answer === "scam")!;
  const pickedBad = [firstScam, ...bad.filter((l) => l !== firstScam)].slice(0, per.bad);
  return shuffle([...legit, ...pickedBad], r);
}

export function judgeListing(answer: Flag, flag: Flag): ListingVerdict {
  if (answer === "legit") return flag === "legit" ? "correct" : "false-alarm";
  if (flag === "legit") return "missed";
  if (answer === "scam") return flag === "scam" ? "correct" : "caught";
  return "correct"; // suspicious answer flagged suspicious or scam
}

/** How far below the area's CMHC benchmark a rent sits (0.48 = 48% below); null when there's no benchmark. */
export function belowBenchmark(rentCents: number, benchmarkCents: number | null): number | null {
  if (benchmarkCents === null || benchmarkCents <= 0) return null;
  return Math.round(((benchmarkCents - rentCents) / benchmarkCents) * 100) / 100;
}

// ---------- phase 2: viewing (quick questions, PRD v3 Change 2) ----------
export type ViewingQuestion = (typeof J.viewing.questions)[number];
export function viewingQuestionsFor(seed: number, n: number): ViewingQuestion[] {
  return shuffle(J.viewing.questions, rng(sub(seed, "viewing"))).slice(0, n);
}

// ---------- phase 5: lease ----------
export interface Clause {
  id: string;
  problem: boolean;
  text: string;
  contentId?: string;
  why?: string;
}
export function leaseFor(offerId: string, seed: number, rentCents: number, d: Difficulty): Clause[] {
  const r = rng(sub(seed, `lease:${offerId}`));
  const ok = shuffle(J.lease.clauses.filter((c) => !c.problem), r).slice(0, J.lease.okPerLease);
  const bad = shuffle(J.lease.clauses.filter((c) => c.problem), r).slice(0, J.lease.problemsPerLease);
  const fmt = `$${(rentCents / 100).toLocaleString("en-CA")}`;
  return shuffle([...ok, ...bad], r).map((c) => ({
    id: c.id,
    problem: c.problem,
    contentId: c.contentId,
    why: (c as { why?: string }).why,
    text: (d === "hard" ? c.legal : c.plain).replaceAll("{rent}", fmt),
  }));
}

// ---------- phase 7: events ----------
export type JourneyEvent = (typeof J.events)[number];
/** Fixed event ids (Base), or a seeded draw of n from the pool (Extended), never repeating `exclude`. */
export function eventsFor(spec: string[] | number, seed: number, exclude: string[] = []): JourneyEvent[] {
  const ids = typeof spec === "number" ? shuffle(J.seededEventPool.filter((id) => !exclude.includes(id)), rng(sub(seed, "events"))).slice(0, spec) : spec;
  return ids.map((id) => J.events.find((e) => e.id === id)!);
}

/** With move-in photos, an event about existing damage ends differently (PRD v3 Change 1, round 4). */
export function photoOutcome(e: JourneyEvent, photos: boolean): string | null {
  const p = (e as { photos?: { with: string; without: string } }).photos;
  return p ? (photos ? p.with : p.without) : null;
}

export function levelCorrect(e: JourneyEvent, picked: Level): boolean {
  return picked === e.level || picked === (e as { alsoLevel?: string }).alsoLevel;
}

// ---------- phase 8 ----------
export const SCAM_REPORT_OPTIONS = [
  { id: "cafc", label: "Canadian Anti-Fraud Centre or police", correct: true },
  { id: "311", label: "311 (City of Toronto)", correct: false },
  { id: "ltb", label: "Landlord and Tenant Board", correct: false },
] as const;

export function disputedDefect(seed: number): string {
  const d = J.moveIn.defects;
  return d[Math.floor(rng(sub(seed, "moveout"))() * d.length)].id;
}

// ---------- report card ----------
/** What a run tested. Base fills only the first group; Extended fills the optional ones too. */
export interface JourneyResult {
  scams: { correct: number; total: number };
  /** Flagged the chosen place's hidden cost before choosing. */
  unknownCostFound: boolean;
  photos: boolean;
  events: { best: number; total: number; levels: number };
  scamReport?: boolean;
  viewing?: { right: number; total: number };
  docs?: { good: number; bad: number };
  lease?: { spotted: number; total: number; falseFlags: number };
  notice?: boolean;
  insured?: boolean;
  receipts: string[];
}

export interface ReportLine {
  label: string;
  value: string;
  score: number; // 0..1
}

const yes = (b: boolean) => (b ? "Yes" : "No");

/** Skill only: never income, neighbourhood, rent chosen, cash-vs-commute preference, insurance or spending. */
export function reportCard(r: JourneyResult): { lines: ReportLine[]; readiness: number } {
  const frac = (a: number, b: number) => (b ? a / b : 1);
  const lines: ReportLine[] = [
    { label: "Scams and suspicious listings caught", value: `${r.scams.correct} of ${r.scams.total}`, score: frac(r.scams.correct, r.scams.total) },
    ...(r.scamReport === undefined ? [] : [{ label: "Knew where to report a scam", value: yes(r.scamReport), score: r.scamReport ? 1 : 0 }]),
    { label: "Unknown costs found", value: yes(r.unknownCostFound), score: r.unknownCostFound ? 1 : 0 },
    ...(r.viewing ? [{ label: "Viewing checks", value: `${r.viewing.right} of ${r.viewing.total}`, score: frac(r.viewing.right, r.viewing.total) }] : []),
    ...(r.docs ? [{ label: "Application: right documents, no red flags", value: `${r.docs.good} of 3 useful · ${r.docs.bad} risky`, score: Math.max(0, frac(r.docs.good, 3) - 0.5 * r.docs.bad) }] : []),
    ...(r.lease
      ? [{ label: "Lease problems spotted", value: `${r.lease.spotted} of ${r.lease.total}${r.lease.falseFlags ? ` (${r.lease.falseFlags} fine clause flagged)` : ""}`, score: Math.max(0, frac(r.lease.spotted, r.lease.total) - 0.15 * r.lease.falseFlags) }]
      : []),
    { label: "Documented the unit at move-in", value: yes(r.photos), score: r.photos ? 1 : 0 },
    { label: "Best response to problems", value: `${r.events.best} of ${r.events.total}`, score: frac(r.events.best, r.events.total) },
    { label: "Right level of government", value: `${r.events.levels} of ${r.events.total}`, score: frac(r.events.levels, r.events.total) },
    ...(r.notice === undefined ? [] : [{ label: "Moved out with proper notice", value: yes(r.notice), score: r.notice ? 1 : 0 }]),
  ];
  const readiness = Math.round((lines.reduce((a, l) => a + l.score, 0) / lines.length) * 100);
  return { lines, readiness };
}
