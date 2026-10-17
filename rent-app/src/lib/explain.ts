// Deterministic plain-language summary built only from computed results (also the Gemini fallback).
import { formatCents as fmt } from "./calc";
import type { AreaResult, RecommendResult } from "./recommend";

const pct = (x: number) => `${Math.round(x * 100)}%`;

function areaLine(a: AreaResult): string {
  return `${a.neighbourhoodName} (${a.rent.zoneLabel}): ${fmt(a.rent.benchmarkCents!)} benchmark, ${a.commute.minutesP50} min`;
}

export function explain(r: RecommendResult): string[] {
  const { input } = r;
  const lines: string[] = [];
  const limits = `a ${fmt(input.housingCapCents)} housing cap and a ${input.commuteLimitMinutes}-minute transit limit to ${r.destination.name}`;

  if (r.feasible.length > 0) {
    lines.push(
      `${r.feasible.length} of ${Object.values(r.counts).reduce((s, n) => s + n, 0)} Toronto neighbourhoods meet both ${limits} for a ${input.bedrooms} apartment.`,
    );
    const top = r.feasible[0];
    lines.push(
      `Ordered by ${input.preference === "money" ? "lowest estimated housing + commute total" : "shortest commute"}, the first is ${areaLine(top)}.`,
    );
  } else {
    lines.push(`No Toronto neighbourhood meets both ${limits} for a ${input.bedrooms} apartment.`);
    const h = r.nearHousing[0];
    const c = r.nearCommute[0];
    if (h) lines.push(`Closest by rent: ${areaLine(h)}. It needs your cap raised by ${fmt(h.requiredChange.housingCapIncreaseCents!)}/month.`);
    if (c) lines.push(`Closest by commute: ${areaLine(c)}. It needs your limit raised by ${c.requiredChange.commuteLimitIncreaseMinutes} min.`);
    if (!h && !c) lines.push("Every area misses both limits, so a single concession is not enough.");
  }

  const t = r.feasible[0]?.transport ?? r.nearHousing[0]?.transport ?? r.nearCommute[0]?.transport;
  if (t) {
    lines.push(
      `TTC fares are modelled at ${fmt(t.cents)}/month (${t.chargedFares} paid fares${t.capReached ? ", monthly cap reached" : ""}) for every area, so a shorter commute saves time here, not fare dollars.`,
    );
  }
  const anyRent = r.feasible[0] ?? r.nearHousing[0] ?? r.nearCommute[0];
  if (anyRent && anyRent.rentBurden === null) {
    lines.push("Rent-to-income share is unavailable because no income above $0 was entered.");
  } else if (anyRent) {
    lines.push(
      `Rent is ${pct(anyRent.rentBurden!)} of your ${r.monthlyIncome.basis} monthly income of ${fmt(r.monthlyIncome.cents)} at that benchmark${
        r.monthlyIncome.basis === "gross" ? " (gross, so take-home share is higher)" : ""
      }.`,
    );
  }
  return lines;
}
