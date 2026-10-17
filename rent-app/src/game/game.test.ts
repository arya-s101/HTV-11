import { describe, expect, it } from "vitest";
import { burden, cheapestFare, commuteHoursPerMonth, monthlyIncomeCents, paygFareCents, pct1 } from "./calc";
import { judgeCivic } from "./civic";
import { EVIDENCE, evidenceFor, FARES, isPlayable, LEVERS, STAGES } from "./data";
import { planLife, stageForAge } from "./life";
import { consequence, fareFor } from "./outcome";
import { buildQuestion, tradeoffOf } from "./question";
import { composeSprite, DEMO_CHARACTER, type Character } from "./sprite";
import type { CivicCategory, PlayableStage } from "./types";

const stage = (id: string) => {
  const s = STAGES.find((x) => x.id === id)!;
  if (!isPlayable(s)) throw new Error(`${id} not playable`);
  return s as PlayableStage;
};
const firstJob = stage("first-job");
const student = stage("student");

describe("PRD §4 hero values (Stage 2, first job)", () => {
  it("monthly income $4,583.33", () => {
    expect(monthlyIncomeCents({ amountCents: 5_500_000, period: "annual" })).toBe(458_333);
  });
  it("rent burden 34.9% and 38.2%", () => {
    expect(pct1(burden(160_000, 458_333)!)).toBe(34.9);
    expect(pct1(burden(175_000, 458_333)!)).toBe(38.2);
    const a = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: false });
    const b = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-b", revealed: false });
    expect([a.rentBurdenPct, b.rentBurdenPct]).toEqual([34.9, 38.2]);
  });
  it("time difference 20 h/month, and $132 fare for BOTH offers (no fare savings)", () => {
    expect(commuteHoursPerMonth(60, 40) - commuteHoursPerMonth(30, 40)).toBe(20);
    const b = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-b", revealed: false });
    expect(b.comparisons[0]).toMatchObject({ rentDiffCents: 15_000, hoursDiff: -20, fareDiffCents: 0 });
    expect(fareFor(firstJob).cents).toBe(13_200);
  });
  it("fare cap at 47 paid trips", () => {
    expect(paygFareCents(47, FARES)).toBe(15_510);
    expect(paygFareCents(60, FARES)).toBe(15_510);
    expect(paygFareCents(46, FARES)).toBe(15_180);
  });
  it("student fare: pay-per-trip beats the post-secondary pass at 32 trips", () => {
    expect(cheapestFare(32, FARES, true)).toMatchObject({ cents: 10_560, method: "adult-payg", pass: 12_815 });
    expect(cheapestFare(44, FARES, true)).toMatchObject({ cents: 12_815, method: "post-secondary-pass" });
    expect(fareFor(student).cents).toBe(10_560);
  });
  it("zero income gives an unknown burden, never Infinity", () => {
    expect(burden(100_000, 0)).toBeNull();
  });
});

describe("unknowns", () => {
  it("utilities stay unknown until revealed, then update housing cash and burden", () => {
    const before = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: false });
    expect(before.utilitiesKnown).toBe(false);
    expect(before.fields.find((f) => f.label === "Utilities")).toMatchObject({ value: null, status: "unknown" });
    const after = consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId: "s2-a", revealed: true });
    expect(after.housingCashCents).toBe(169_500);
    expect(after.housingBurdenPct).toBe(37);
  });
  it("every displayed number carries a status", () => {
    for (const s of [student, firstJob]) for (const o of s.offers) {
      for (const revealed of [false, true]) {
        const c = consequence({ character: DEMO_CHARACTER, stage: s, offerId: o.id, revealed });
        for (const f of c.fields) {
          expect(["measured", "derived", "illustrative", "unknown"]).toContain(f.status);
          expect(f.status === "unknown").toBe(f.value === null);
        }
      }
    }
  });
});

describe("appearance is cosmetic only", () => {
  it("changing every appearance layer changes no number, question or feedback", () => {
    const other: Character = {
      name: "Alex",
      startAge: 20,
      appearance: { skin: 5, hairStyle: "long", hairColor: 4, outfit: "dress", outfitColor: 3, accessory: "cap" },
    };
    expect(composeSprite(other.appearance)).not.toEqual(composeSprite(DEMO_CHARACTER.appearance));
    for (const s of [student, firstJob]) for (const o of s.offers) {
      const a = consequence({ character: DEMO_CHARACTER, stage: s, offerId: o.id, revealed: true });
      const b = consequence({ character: other, stage: s, offerId: o.id, revealed: true });
      expect(b).toEqual(a);
    }
  });
});

describe("character creator", () => {
  it("has at least 4 customizable layers and a valid 16x24 sprite", () => {
    const layers = Object.keys(DEMO_CHARACTER.appearance);
    expect(layers.length).toBeGreaterThanOrEqual(4);
    const g = composeSprite(DEMO_CHARACTER.appearance);
    expect(g).toHaveLength(24);
    expect(g.every((r) => r.length === 16)).toBe(true);
  });
});

describe("life stages", () => {
  it("maps starting age to the right stage", () => {
    expect(stageForAge(20).id).toBe("student");
    expect(stageForAge(16).id).toBe("student");
    expect(stageForAge(23).id).toBe("first-job");
    expect(stageForAge(27).id).toBe("new-job");
    expect(stageForAge(66).id).toBe("retirement");
  });
  it("plays from the starting stage onward and ages the character", () => {
    const p = planLife(20);
    expect(p.playable.map((x) => [x.stage.id, x.age])).toEqual([["student", 20], ["first-job", 23]]);
    expect(planLife(24).playable.map((x) => [x.stage.id, x.age])).toEqual([["first-job", 24]]);
    expect(planLife(40).playable).toEqual([]);
    expect(planLife(20).comingSoon.map((s) => s.id)).toEqual(["new-job", "partner", "kids", "retirement"]);
  });
  it("only ships stages whose lever is officially sourced", () => {
    for (const s of STAGES.filter(isPlayable)) {
      const l = LEVERS.find((x) => x.id === s.leverId)!;
      expect(l.sourced).toBe(true);
      expect(l.sources.length).toBeGreaterThan(0);
    }
    expect(STAGES.filter(isPlayable).map((s) => s.id)).toEqual(["student", "first-job"]);
  });
});

describe("evidence", () => {
  it("has real, labelled facts with geography and reference period for every offer", () => {
    for (const s of [student, firstJob]) for (const o of s.offers) {
      const e = evidenceFor(o.neighbourhoodId);
      const facts = [e.tenantShelter30, e.medianRentedShelterCost, e.cmhcRent[o.cmhcBedroom]];
      expect(facts.filter((f) => f.status === "measured").length).toBeGreaterThanOrEqual(2);
      for (const f of facts) expect(f.geography && f.reference_period).toBeTruthy();
    }
  });
  it("keeps CMHC suppressed values unknown, not zero", () => {
    expect(EVIDENCE["134"].cmhcRent.studio).toMatchObject({ value: null, status: "unknown" });
  });
});

describe("civic turn", () => {
  const all = (s: PlayableStage, f: (c: CivicCategory) => CivicCategory) =>
    Object.fromEntries(s.civicCards.map((c) => [c.id, f(c.correct)]));
  it("scores correct attribution and cites a source", () => {
    const r = judgeCivic(firstJob.civicCards, all(firstJob, (c) => c));
    expect(r.correctCount).toBe(3);
    expect(r.leverCorrect).toBe(true);
    expect(r.feedback.find((f) => f.card.correct === "municipal")!.sources.length).toBeGreaterThan(0);
  });
  it("explains a jurisdiction error with a source link", () => {
    const wrong = all(firstJob, (c) => (c === "non-municipal" ? "municipal" : c === "municipal" ? "personal" : c));
    const r = judgeCivic(firstJob.civicCards, wrong);
    expect(r.leverCorrect).toBe(false);
    const prov = r.feedback.find((f) => f.card.correct === "non-municipal")!;
    expect(prov.text).toMatch(/Province of Ontario/);
    expect(prov.sources[0].url).toMatch(/ontario\.ca/);
  });
});

describe("draft question", () => {
  const q = (s: PlayableStage, offerId: string) => {
    const c = consequence({ character: DEMO_CHARACTER, stage: s, offerId, revealed: true });
    const std = s.civicCards.find((x) => x.correct === "municipal")!.standard!;
    return buildQuestion(s, c, evidenceFor(c.offer.neighbourhoodId), std);
  };
  it("changes with the player's choice and names a lever and a measurable outcome", () => {
    const a = q(firstJob, "s2-a");
    const b = q(firstJob, "s2-b");
    expect(a.text).not.toEqual(b.text);
    expect([tradeoffOf(firstJob, "s2-a"), tradeoffOf(firstJob, "s2-b")]).toEqual(["long-commute", "paid-for-time"]);
    expect(a.text).toMatch(/Black Creek/);
    expect(b.text).toMatch(/20 fewer hours a month meant paying \$150 more in rent, with no fare savings/);
    for (const x of [a, b, q(student, "s1-a"), q(student, "s1-b"), q(student, "s1-c")]) {
      expect(x.text).toMatch(/TTC/);
      expect(x.text).toMatch(/standard/);
      expect(x.citations.length).toBeGreaterThanOrEqual(2);
    }
  });
  it("never endorses, predicts or claims firsts", () => {
    for (const s of [student, firstJob]) for (const o of s.offers) {
      const t = q(s, o.id).text.toLowerCase();
      expect(t).not.toMatch(/vote for|endorse|will (lower|reduce|save)|first|only/);
    }
  });
});
