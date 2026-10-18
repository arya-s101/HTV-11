// Fresh locations every game (seeded, so multiplayer rooms and the demo replay exactly). Each fictional offer keeps
// its reviewed character (unit, surprise, how it compares on price and commute) but moves to a real Toronto
// neighbourhood with a similar commute. Its illustrative rent keeps the same ratio to that area's real CMHC average,
// so a "below average" place stays below average. Real figures (CMHC, Census, routed minutes) come from evidence.
import { EVIDENCE } from "./data";
import { money } from "./outcome";
import { rng, sub } from "./random";
import { travelMinutes } from "./tailor";
import type { Offer, PlayableStage } from "./types";

/** How far (in routed minutes) a new location's commute may be from the reviewed one. */
const COMMUTE_SLACK = 10;
/** Small per-game wobble on the rent ratio, so prices vary too. */
const RENT_JITTER = 0.04;

const bench = (id: number, bedroom: string) => EVIDENCE[String(id)]?.cmhcRent[bedroom]?.value ?? null;
const roundRent = (cents: number) => Math.round(cents / 2500) * 2500;

/** Neighbourhoods with a published CMHC average for this unit size and a measured Census tenant figure. */
function pool(bedroom: string): number[] {
  return Object.values(EVIDENCE)
    .filter((e) => e.cmhcRent[bedroom]?.value && e.tenantShelter30.value !== null)
    .map((e) => e.id);
}

/** Rewrites the reviewed text's numbers (rent, minutes) for the new location. */
function retext(t: string, from: { rent: number; minutes: number }, to: { rent: number; minutes: number }): string {
  return t
    .replaceAll(money(from.rent), money(to.rent))
    .replace(new RegExp(`\\b${from.minutes}(?=[- ]minute)`, "g"), String(to.minutes));
}

function moveOffer(o: Offer, id: number, minutes: number, r: () => number): Offer {
  const was = bench(o.neighbourhoodId, o.cmhcBedroom);
  const now = bench(id, o.cmhcBedroom);
  if (!was || !now) return o;
  const rentCents = roundRent((o.rentCents / was) * now * (1 - RENT_JITTER + r() * RENT_JITTER * 2));
  const from = { rent: o.rentCents, minutes: o.commuteMinutes };
  const to = { rent: rentCents, minutes };
  return {
    ...o,
    neighbourhoodId: id,
    rentCents,
    commuteMinutes: minutes,
    reveal: { ...o.reveal, text: retext(o.reveal.text, from, to), lines: o.reveal.lines.map((l) => retext(l, from, to)) },
    presentation: { ...o.presentation, listingText: retext(o.presentation.listingText, from, to), finePrint: retext(o.presentation.finePrint, from, to) },
  };
}

/** The stage with each offer moved to a seeded, similar-commute neighbourhood. Rooms keep their reviewed place (CMHC has no room rents). */
export function rollStage(stage: PlayableStage, seed: number): PlayableStage {
  const r = rng(sub(seed, `places:${stage.id}`));
  const used = new Set<number>();
  const offers = stage.offers.map((o) => {
    if (o.unitType === "room") return o;
    const target = travelMinutes(o.neighbourhoodId, stage.destination.id) ?? o.commuteMinutes;
    const near = pool(o.cmhcBedroom).filter((id) => !used.has(id) && Math.abs((travelMinutes(id, stage.destination.id) ?? Infinity) - target) <= COMMUTE_SLACK);
    if (!near.length) return o;
    const id = near[Math.floor(r() * near.length)];
    used.add(id);
    return moveOffer(o, id, travelMinutes(id, stage.destination.id)!, r);
  });
  return { ...stage, offers };
}

/** A scam or suspicious listing moved to a seeded neighbourhood (not one of this game's real places), rent re-priced the same way. */
export function rollListing<T extends { id: string; neighbourhoodId: number; cmhcBedroom: string; rentCents: number; text: string }>(l: T, seed: number, avoid: number[]): T {
  const r = rng(sub(seed, `listing:${l.id}`));
  const ids = pool(l.cmhcBedroom).filter((id) => !avoid.includes(id));
  const was = bench(l.neighbourhoodId, l.cmhcBedroom);
  if (!ids.length || !was) return l;
  const id = ids[Math.floor(r() * ids.length)];
  const rentCents = roundRent((l.rentCents / was) * bench(id, l.cmhcBedroom)!);
  return { ...l, neighbourhoodId: id, rentCents, text: l.text.replaceAll(money(l.rentCents), money(rentCents)) };
}
