// Consequence step: every number computed in code, each with its status and provenance.
import { burden, cheapestFare, commuteHoursPerMonth, monthlyIncomeCents, oneWayTripsPerMonth, pct1 } from "./calc";
import { FARES } from "./data";
import type { Character } from "./sprite";
import type { NegotiatedTerms, Offer, PlayableStage, Shown } from "./types";

const FICTIONAL = { geography: "Fictional scenario", reference_period: "2026 dollars", source_url: null };
const FARE_URL = FARES.sources[0].url;

export interface Consequence {
  offer: Offer;
  monthlyIncomeCents: number;
  housingCashCents: number;
  utilitiesKnown: boolean;
  rentBurdenPct: number | null;
  housingBurdenPct: number | null;
  fareCents: number;
  commuteHours: number;
  fields: Shown[];
  comparisons: { offerId: string; title: string; neighbourhoodId: number; rentDiffCents: number; hoursDiff: number; fareDiffCents: number }[];
}

function utilitiesCents(offer: Offer, revealed: boolean, terms?: NegotiatedTerms): number | null {
  if (offer.utilities.includedInRent || terms?.utilitiesIncluded) return 0;
  if (revealed && offer.reveal.id === "utilities") return offer.reveal.extraMonthlyCents;
  return null;
}

export function fareFor(stage: PlayableStage) {
  return cheapestFare(oneWayTripsPerMonth(stage.commuteDaysPerMonth), FARES, stage.fareOptions.includes("post-secondary-pass"));
}

/**
 * The character is accepted so tests can prove appearance never changes a number (PRD §5):
 * nothing below reads it. Difficulty is deliberately NOT an input: it changes presentation, never what is true.
 * `terms` are code-validated negotiated terms (rent, utilities concession); the rent stays illustrative.
 */
export function consequence(input: { character: Character; stage: PlayableStage; offerId: string; revealed: boolean; terms?: NegotiatedTerms }): Consequence {
  const { stage, revealed, terms } = input;
  const listed = stage.offers.find((o) => o.id === input.offerId);
  if (!listed) throw new Error(`Unknown offer ${input.offerId}`);
  const offer: Offer = terms ? { ...listed, rentCents: terms.rentCents } : listed;

  const income = monthlyIncomeCents(stage.income);
  const trips = oneWayTripsPerMonth(stage.commuteDaysPerMonth);
  const fare = fareFor(stage);
  const util = utilitiesCents(offer, revealed, terms);
  const housing = offer.rentCents + (util ?? 0);
  const rentBurden = burden(offer.rentCents, income);
  const housingBurden = util !== null && util > 0 ? burden(housing, income) : null;
  const hours = commuteHoursPerMonth(offer.commuteMinutes, trips);
  const basis = stage.income.basis === "gross" ? "gross (before-tax)" : "net (take-home)";

  const fields: Shown[] = [
    {
      ...FICTIONAL,
      label: `Monthly income (${stage.income.basis})`,
      value: income,
      unit: "CAD cents/month",
      status: "derived",
      note:
        stage.income.period === "annual"
          ? `Illustrative ${money(stage.income.amountCents)}/yr ${stage.income.basis} ÷ 12`
          : `Illustrative ${stage.income.basis} monthly income (${stage.income.description})`,
    },
    terms
      ? {
          ...FICTIONAL,
          label: "Rent (illustrative, negotiated)",
          value: offer.rentCents,
          unit: "CAD cents/month",
          status: "illustrative",
          note: `Listed at ${money(terms.askingCents)}${terms.concessions.length ? `; also agreed: ${terms.concessions.map((c) => c.label.toLowerCase()).join(", ")}` : ""}`,
        }
      : { ...FICTIONAL, label: "Listed rent", value: offer.rentCents, unit: "CAD cents/month", status: "illustrative" },
    util === null
      ? { ...FICTIONAL, label: "Utilities", value: null, unit: "CAD cents/month", status: "unknown", note: offer.utilities.note }
      : {
          ...FICTIONAL,
          label: "Utilities",
          value: util,
          unit: "CAD cents/month",
          status: "illustrative",
          note: offer.utilities.includedInRent ? "Included in rent" : terms?.utilitiesIncluded ? "Included in rent: you negotiated it" : "Revealed after you chose",
        },
    {
      ...FICTIONAL,
      label: "Housing cash per month",
      value: housing,
      unit: "CAD cents/month",
      status: "derived",
      note: util === null ? "Rent only: utilities are still unknown" : util === 0 ? "Rent (utilities included)" : "Rent + utilities",
    },
    {
      ...FICTIONAL,
      label: `Rent burden (rent ÷ ${basis} income)`,
      value: rentBurden === null ? null : pct1(rentBurden),
      unit: "%",
      status: rentBurden === null ? "unknown" : "derived",
      note: stage.income.basis === "gross" ? "Measured against gross income; take-home share is higher." : undefined,
    },
    ...(housingBurden !== null
      ? [
          {
            ...FICTIONAL,
            label: `Housing burden (rent + utilities ÷ ${basis} income)`,
            value: pct1(housingBurden),
            unit: "%",
            status: "derived" as const,
          },
        ]
      : []),
    {
      label: "TTC fare per month",
      value: fare.cents,
      unit: "CAD cents/month",
      geography: "City of Toronto (TTC)",
      reference_period: FARES.referencePeriod,
      source_url: FARE_URL,
      status: "derived",
      note:
        `${trips} one-way trips × $3.30 adult fare (47-paid-trip cap; free 2-hour transfers)` +
        (fare.pass !== null ? `. Post-secondary pass would be ${money(fare.pass)}, so ${fare.method === "adult-payg" ? "pay-per-trip is cheaper" : "the pass is cheaper"}` : "") +
        ". Same for every offer.",
    },
    { ...FICTIONAL, label: "Commute, one way", value: offer.commuteMinutes, unit: "minutes", status: "illustrative", note: `To ${stage.destination.name}; not a computed route` },
    { ...FICTIONAL, label: "Commute time per month", value: Math.round(hours * 10) / 10, unit: "hours/month", status: "derived", note: `${offer.commuteMinutes} min × ${trips} trips` },
  ];

  const comparisons = stage.offers
    .filter((o) => o.id !== offer.id)
    .map((o) => ({
      offerId: o.id,
      title: o.title,
      neighbourhoodId: o.neighbourhoodId,
      rentDiffCents: offer.rentCents - o.rentCents,
      hoursDiff: Math.round((hours - commuteHoursPerMonth(o.commuteMinutes, trips)) * 10) / 10,
      fareDiffCents: 0,
    }));

  return {
    offer,
    monthlyIncomeCents: income,
    housingCashCents: housing,
    utilitiesKnown: util !== null,
    rentBurdenPct: rentBurden === null ? null : pct1(rentBurden),
    housingBurdenPct: housingBurden === null ? null : pct1(housingBurden),
    fareCents: fare.cents,
    commuteHours: Math.round(hours * 10) / 10,
    fields,
    comparisons,
  };
}

export function money(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-CA");
  const rem = abs % 100;
  return `${sign}$${dollars}${rem ? "." + String(rem).padStart(2, "0") : ""}`;
}
