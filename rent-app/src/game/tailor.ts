// Applies what the player explicitly told us (PRD v4 Change 4) to a stage: workplace → commute minutes from the
// routing snapshot, schedule → commute days, income band → a "player_input" income. Pure and deterministic.
// Reads ONLY workplace, schedule and income. Identity fields (pronouns, languages, background, look) are never read,
// so they can't change a price, offer, landlord, difficulty, scam count or score (tested in tailor.test.ts).
import travelJson from "../../data/snapshots/travel-times.json";
import { INCOME_BANDS, WORKPLACES, type Profile } from "./profile";
import type { Field, PlayableStage } from "./types";

const TRAVEL = travelJson as unknown as { source: { engine: string; departureWindow: { start: string; minutes: number } }; minutes: Record<string, Record<string, [number, number, number]>> };

export interface Tailoring {
  /** Set when the commute comes from the routing snapshot for the player's workplace. */
  commute?: { workplace: string; field: Omit<Field<number>, "value"> };
  /** Set when the income is the player's own band. */
  income?: { band: string };
  schedule?: string;
}

/** Days per month a schedule commutes, from the stage's in-person default. */
export function commuteDays(defaultDays: number, schedule: Profile["schedule"]): number {
  if (schedule === "remote") return 0;
  if (schedule === "hybrid") return Math.round((defaultDays * 3) / 5);
  return defaultDays;
}

/** Median scheduled transit + walk time, in minutes, from a neighbourhood to a workplace; null if not routed. */
export function travelMinutes(neighbourhoodId: number, workplace: string): number | null {
  return TRAVEL.minutes[workplace]?.[String(neighbourhoodId)]?.[1] ?? null;
}

export function tailorStage(stage: PlayableStage, p: Pick<Profile, "workplace" | "schedule" | "income"> = {}): { stage: PlayableStage; tailoring: Tailoring } {
  const tailoring: Tailoring = {};
  let s = stage;
  if (p.workplace) {
    const w = WORKPLACES.find((x) => x.id === p.workplace)!;
    s = { ...s, offers: s.offers.map((o) => ({ ...o, commuteMinutes: travelMinutes(o.neighbourhoodId, w.id) ?? o.commuteMinutes })) };
    tailoring.commute = {
      workplace: w.label,
      field: {
        unit: "minutes",
        geography: `Neighbourhood representative point → ${w.label}`,
        reference_period: "Weekday 7:30–8:30 a.m., scheduled TTC service",
        source_url: "https://open.toronto.ca/dataset/ttc-routes-and-schedules/",
        status: "derived",
        source_ref: `${TRAVEL.source.engine}; median of departures in the window (data/snapshots/travel-times.json)`,
      },
    };
  }
  if (p.schedule) {
    s = { ...s, commuteDaysPerMonth: commuteDays(s.commuteDaysPerMonth, p.schedule) };
    tailoring.schedule = p.schedule;
  }
  if (p.income && p.income !== "typical") {
    const b = INCOME_BANDS.find((x) => x.id === p.income)!;
    s = { ...s, income: { amountCents: b.midCents, period: "annual", basis: "gross", description: `your band, ${b.label} (midpoint)` } };
    tailoring.income = { band: b.label };
  }
  return { stage: s, tailoring };
}
