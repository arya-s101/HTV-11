// Builds the player's draft candidate question deterministically from their choice, the stage's lever
// and cited evidence. Template-based; no AI. Neutral: names a lever and a measurable outcome, endorses no one.
import { lever } from "./data";
import { money, type Consequence } from "./outcome";
import type { NeighbourhoodEvidence, PlayableStage, StandardKey } from "./types";

export type Tradeoff = "long-commute" | "paid-for-time" | "middle";

export interface DraftQuestion {
  stageId: string;
  text: string;
  /** The ask itself, as on-screen lines of at most 15 words; the full text keeps the context. */
  short: string[];
  tradeoff: Tradeoff;
  leverName: string;
  measurableOutcome: string;
  citations: { label: string; url: string | null }[];
}

const MEASURE: Record<StandardKey, { standardName: string; outcome: string }> = {
  frequency: { standardName: "peak-period frequency standard", outcome: "how often peak-period buses actually ran compared with the standard" },
  reliability: { standardName: "on-time departure standard", outcome: "the share of departures that met the on-time standard" },
};

export function tradeoffOf(stage: PlayableStage, offerId: string): Tradeoff {
  const offer = stage.offers.find((o) => o.id === offerId)!;
  const longest = Math.max(...stage.offers.map((o) => o.commuteMinutes));
  const shortest = Math.min(...stage.offers.map((o) => o.commuteMinutes));
  const cheapest = Math.min(...stage.offers.map((o) => o.rentCents));
  if (offer.commuteMinutes === longest) return "long-commute";
  if (offer.commuteMinutes === shortest && offer.rentCents > cheapest) return "paid-for-time";
  return "middle";
}

export function buildQuestion(stage: PlayableStage, c: Consequence, ev: NeighbourhoodEvidence, standard: StandardKey): DraftQuestion {
  const l = lever(stage.leverId);
  const m = MEASURE[standard];
  const tradeoff = tradeoffOf(stage, c.offer.id);
  const nb = ev.name;
  const dest = stage.destination.name;
  const pct = ev.tenantShelter30.value;
  const census = pct === null ? "" : `In ${nb}, ${pct}% of tenant households spent 30% or more of their income on shelter (2021 Census). `;
  const review = "The TTC's review of its service standards is scheduled to report back to its Board in Q4 2026.";

  let text: string;
  if (tradeoff === "long-commute") {
    text =
      `${census}Renters there can face transit commutes of about ${c.offer.commuteMinutes} minutes to ${dest}. ${review} ` +
      `If elected, would you ask the TTC to publish ${m.outcome} for routes serving ${nb}, and by what date would residents see that report?`;
  } else if (tradeoff === "paid-for-time") {
    // Compare with the offer that saves the most commuting for this choice (the longest-commute one).
    const vs = [...c.comparisons].sort((a, b) => a.hoursDiff - b.hoursDiff)[0];
    text =
      `${census}Renters often pay more to live closer to work: in this scenario, commuting ${-vs.hoursDiff} fewer hours a month meant paying ${money(vs.rentDiffCents)} more in rent, with no fare savings. ${review} ` +
      `Which change to the TTC's ${m.standardName} would you prioritize for routes from neighbourhoods farther out, and how would you report progress publicly?`;
  } else {
    text =
      `${census}A ${c.offer.commuteMinutes}-minute trip to ${dest} depends on how often and how reliably the route runs. ${review} ` +
      `Would you support the TTC reporting ${m.outcome}, route by route, and how often should that report be public?`;
  }

  const short =
    standard === "reliability"
      ? ["Would you push the TTC to publish on-time departures, route by route?", "And when would residents see that report?"]
      : ["Would you push the TTC to publish how often peak buses actually run?", "And when would residents see that report?"];
  return {
    stageId: stage.id,
    text,
    short,
    tradeoff,
    leverName: l.name,
    measurableOutcome: m.outcome,
    citations: [
      ...(pct === null ? [] : [{ label: `2021 Neighbourhood Profiles: ${nb}`, url: ev.tenantShelter30.source_url }]),
      ...l.sources.map((s) => ({ label: s.title, url: s.url })),
    ],
  };
}

/**
 * City-level problems met during the rental journey (PRD v2 §5.7): no heat, or repairs ignored.
 * Neutral, names the City lever and a measurable outcome, cites the sources.
 */
export function buildCityQuestion(kind: "heat" | "repairs", ev: NeighbourhoodEvidence): DraftQuestion {
  const l = lever("rentsafeto");
  const pct = ev.tenantShelter30.value;
  const census = pct === null ? "" : ` In ${ev.name}, ${pct}% of tenant households spent 30% or more of their income on shelter (2021 Census).`;
  const text =
    kind === "heat"
      ? `Toronto requires landlords to keep rented units at least 21°C from October 1 to May 15 where they pay for heat, and tenants can call 311 when it isn't fixed.${census} If elected, would you support publishing how quickly the City resolves 311 no-heat complaints, and what target would you set?`
      : `Toronto asks tenants to put repair requests in writing; landlords must answer urgent ones within 24 hours and others within seven days, and tenants can call 311 if nothing happens.${census} If elected, would you support publishing how long the City takes to resolve 311 repair complaints, building by building, and how often would you report it?`;
  return {
    stageId: `journey-${kind}`,
    text,
    short:
      kind === "heat"
        ? ["Would you publish how fast 311 no-heat complaints get resolved?", "And what target would you set?"]
        : ["Would you publish how long 311 repair complaints take to resolve?", "Building by building, and how often?"],
    tradeoff: "middle",
    leverName: l.name,
    measurableOutcome: kind === "heat" ? "how quickly 311 no-heat complaints are resolved" : "how long 311 repair complaints take to resolve",
    citations: [
      ...(pct === null ? [] : [{ label: `2021 Neighbourhood Profiles: ${ev.name}`, url: ev.tenantShelter30.source_url }]),
      ...l.sources.map((s) => ({ label: s.title, url: s.url })),
    ],
  };
}
