import { describe, expect, it } from "vitest";
import { evidenceFor, STAGES } from "./data";
import { listingsFor, verifyOptions } from "./journey";
import { rollStage } from "./locations";
import { money } from "./outcome";
import { travelMinutes } from "./tailor";
import type { PlayableStage } from "./types";

const firstJob = STAGES.find((s) => s.id === "first-job")! as PlayableStage;
const ratio = (rent: number, id: number) => rent / evidenceFor(id).cmhcRent["1br"].value!;

describe("fresh locations every game", () => {
  it("is deterministic per seed and varies across seeds", () => {
    expect(rollStage(firstJob, 7)).toEqual(rollStage(firstJob, 7));
    const seen = new Set<number>();
    for (let seed = 1; seed <= 20; seed++) for (const o of rollStage(firstJob, seed).offers) seen.add(o.neighbourhoodId);
    expect(seen.size).toBeGreaterThan(20);
  });
  it("each place keeps a similar routed commute, a distinct neighbourhood and its price position", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rolled = rollStage(firstJob, seed).offers;
      expect(new Set(rolled.map((o) => o.neighbourhoodId)).size).toBe(rolled.length);
      rolled.forEach((o, i) => {
        const orig = firstJob.offers[i];
        expect(o.commuteMinutes).toBe(travelMinutes(o.neighbourhoodId, "union"));
        expect(Math.abs(o.commuteMinutes - orig.commuteMinutes)).toBeLessThanOrEqual(10);
        expect(Math.abs(ratio(o.rentCents, o.neighbourhoodId) - ratio(orig.rentCents, orig.neighbourhoodId))).toBeLessThan(0.06);
        expect(o.presentation.listingText).not.toContain(money(orig.rentCents) === money(o.rentCents) ? "\u0000" : money(orig.rentCents));
      });
    }
  });
  it("scam listings move too, stay well below the area average, and avoid the real places", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const stage = rollStage(firstJob, seed);
      const ls = listingsFor(stage, "normal", seed);
      for (const l of ls.filter((x) => x.answer === "scam")) {
        expect(stage.offers.map((o) => o.neighbourhoodId)).not.toContain(l.neighbourhoodId);
        expect(1 - l.rentCents / l.benchmarkCents!).toBeGreaterThanOrEqual(0.38);
        expect(l.text).toContain(money(l.rentCents));
      }
    }
  });
});

describe("what to double-check: three real, two decoys", () => {
  it("always offers the surprises these places hide, plus two decoys", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const opts = verifyOptions(firstJob.offers, seed);
      expect(opts).toHaveLength(5);
      expect(opts.filter((o) => o.real)).toHaveLength(3);
      for (const o of firstJob.offers) expect(opts.map((x) => x.id)).toContain(o.reveal.id);
    }
  });
});
