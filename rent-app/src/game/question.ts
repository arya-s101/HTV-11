// Builds the player's draft candidate question deterministically from their choice, the stage's lever
// and cited evidence. Template-based; no AI. Neutral: names a lever and a measurable outcome, endorses no one.
import { lever } from "./data";
import { money, type Consequence } from "./outcome";
import type { NeighbourhoodEvidence, PlayableStage, StandardKey } from "./types";

export type Tradeoff = "long-commute" | "paid-for-time" | "middle";

export interface DraftQuestion {
  stageId: string;
  text: string;
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

  return {
    stageId: stage.id,
    text,
    tradeoff,
    leverName: l.name,
    measurableOutcome: m.outcome,
    citations: [
      ...(pct === null ? [] : [{ label: `2021 Neighbourhood Profiles: ${nb}`, url: ev.tenantShelter30.source_url }]),
      ...l.sources.map((s) => ({ label: s.title, url: s.url })),
    ],
  };
}
