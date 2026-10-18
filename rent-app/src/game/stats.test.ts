import { describe, expect, it } from "vitest";
import statsJson from "../../data/stats.json";
import { EVIDENCE, STAGES } from "./data";
import { DEMO_SEED, J } from "./journey";
import { planRun, TEMPLATES } from "./questions";
import { formatStat, statFor, STATS } from "./stats";

const firstJobNeighbourhoods = STAGES.find((s) => s.id === "first-job")!.offers!.map((o) => o.neighbourhoodId);

describe("stat cards (PRD v3 Change 4): real, sourced numbers only", () => {
  it("no card shows an illustrative or unknown value", () => {
    for (const c of STATS) for (const f of [c.stat, c.compare_to].filter(Boolean)) expect(["measured", "derived"], c.id).toContain(f!.status);
  });
  it("every card has a number, a unit, geography, period, an https source and a verifier", () => {
    for (const c of STATS)
      for (const f of [c.stat, c.compare_to].filter(Boolean)) {
        expect(typeof f!.value, c.id).toBe("number");
        expect(f!.unit, c.id).toBeTruthy();
        expect(f!.geography, c.id).toBeTruthy();
        expect(f!.reference_period, c.id).toBeTruthy();
        expect(f!.source_url, c.id).toMatch(/^https:\/\//);
        expect(f!.source_ref, c.id).toBeTruthy();
      }
    for (const c of STATS) expect(c.verified_by, c.id).toBeTruthy();
  });
  it("labels are at most 12 words; ids are unique", () => {
    for (const c of STATS) expect(c.label.split(/\s+/).length, c.label).toBeLessThanOrEqual(12);
    expect(new Set(STATS.map((c) => c.id)).size).toBe(STATS.length);
    expect(statsJson.cards.length).toBe(STATS.length);
  });
  it("a comparison bar never mixes sources", () => {
    for (const c of STATS) if (c.compare_to) expect(new URL(c.compare_to.source_url).host, c.id).toBe(new URL(c.stat.source_url).host);
  });
  it("a run never shows the same figure twice, and an unknown question gets no card", () => {
    const first = statFor("listing:legit", [])!;
    const second = statFor("listing:legit", [first.group])!;
    expect(second.group).not.toBe(first.group);
    expect(statFor("no-such-question", [])).toBeNull();
  });
  it("every Base question with a sourced stat has a card", () => {
    const base = ["listing:legit", "listing:scam", "verify", ...firstJobNeighbourhoods.map((id) => `choose:nb:${id}`), "movein", ...planRun(DEMO_SEED, "base").events.flatMap((id) => [`event:${id}:action`, `event:${id}:level`])];
    for (const q of base) expect(statFor(q, []), q).not.toBeNull();
  });
  it("cards point at questions that exist", () => {
    const known = new Set([
      "listing:legit",
      "listing:scam",
      "listing:suspicious",
      "scam-report",
      "verify",
      "apply:rival",
      "movein",
      ...J.lease.clauses.map((c) => `lease:${c.id}`),
      ...TEMPLATES.filter((t) => t.round === "live").flatMap((t) => [`event:${t.id}:action`, `event:${t.id}:level`]),
      ...Object.keys(EVIDENCE).map((id) => `choose:nb:${id}`),
    ]);
    for (const c of STATS) expect(known, c.question_id).toContain(c.question_id);
  });
  it("formats by unit", () => {
    expect(formatStat(202000, "CAD cents/month")).toBe("$2,020/mo");
    expect(formatStat(3.5, "%")).toBe("3.5%");
    expect(formatStat(638, "CAD millions")).toBe("$638M");
    expect(formatStat(330, "CAD cents")).toBe("$3.30");
    expect(formatStat(108878, "reports")).toBe("108,878");
  });
});
