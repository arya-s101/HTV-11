import { describe, expect, it } from "vitest";
import { STAGES } from "./data";
import { consequence } from "./outcome";
import { DEMO_CHARACTER } from "./sprite";
import type { PlayableStage } from "./types";
import { placeVerdict } from "./verdict";

const firstJob = STAGES.find((s) => s.id === "first-job")! as PlayableStage;
const verdictFor = (offerId: string, verify: Parameters<typeof placeVerdict>[2] = []) => {
  const offer = firstJob.offers.find((o) => o.id === offerId)!;
  return placeVerdict(consequence({ character: DEMO_CHARACTER, stage: firstJob, offerId, revealed: true }), offer, verify);
};
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

describe("your place, explained", () => {
  it("every offer gets affordability, price and surprise checks within the text rule", () => {
    for (const o of firstJob.offers) {
      const v = verdictFor(o.id);
      expect(v.checks.map((c) => c.id)).toEqual(["afford", "price", "surprise"]);
      for (const l of [...v.lines, ...v.checks.flatMap((c) => c.lines)]) expect(words(l), l).toBeLessThanOrEqual(15);
      for (const c of v.checks) expect(c.lines.length).toBeLessThanOrEqual(3);
    }
  });
  it("flagging the hidden surprise passes that check and can only improve the grade", () => {
    const rank = { great: 0, okay: 1, risky: 2 };
    for (const o of firstJob.offers) {
      const missed = verdictFor(o.id);
      const flagged = verdictFor(o.id, [o.reveal.id]);
      expect(flagged.checks.find((c) => c.id === "surprise")!.good).toBe(true);
      expect(rank[flagged.grade]).toBeLessThanOrEqual(rank[missed.grade]);
    }
  });
  it("neighbourhood and CMHC numbers are the measured, sourced fields", () => {
    const v = verdictFor("s2-a");
    const measured = v.checks.flatMap((c) => c.stats).filter((s) => s.f.status === "measured");
    expect(measured.length).toBeGreaterThanOrEqual(2);
    for (const s of measured) expect(s.f.source_url).toMatch(/^https:/);
  });
});
