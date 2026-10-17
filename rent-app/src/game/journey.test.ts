import { describe, expect, it } from "vitest";
import { evidenceFor, isPlayable, STAGES } from "./data";
import {
  belowBenchmark,
  content,
  CONTENT,
  DEMO_SEED,
  eventsFor,
  J,
  judgeListing,
  leaseFor,
  levelCorrect,
  listingsFor,
  photoOutcome,
  reportCard,
  viewingQuestionsFor,
  type JourneyResult,
} from "./journey";
import { MODES } from "../config/modes";
import { buildCityQuestion } from "./question";
import type { PlayableStage } from "./types";

const firstJob = STAGES.find((s) => s.id === "first-job")! as PlayableStage;

describe("content (PRD v2 §8): nothing ships without an official source", () => {
  it("every item has a claim, an https source on an official domain, a retrieval date and a verifier", () => {
    const official = /^https:\/\/(www\.)?(ontario\.ca|toronto\.ca|canada\.ca|cmhc-schl\.gc\.ca|tribunalsontario\.ca|ohrc\.on\.ca)\//;
    for (const c of CONTENT) {
      expect(c.claim.length).toBeGreaterThan(10);
      expect(c.source_url).toMatch(official);
      expect(c.retrieved).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(c.verified_by).toBeTruthy();
    }
  });
  it("every content id the journey uses exists", () => {
    const ids = [
      ...J.listings.flatMap((l) => l.redFlags),
      ...J.viewing.questions.map((q) => q.contentId),
      ...J.apply.docs.map((d) => d.contentId),
      J.apply.infoContentId,
      ...J.lease.clauses.map((c) => c.contentId).filter(Boolean),
      J.moveIn.contentId,
      J.moveIn.insuranceContentId,
      ...J.events.flatMap((e) => [e.contentId, ...((e as { extraContentIds?: string[] }).extraContentIds ?? [])]),
      J.moveOut.contentId,
      J.moveOut.depositContentId,
      "scam-report",
    ] as string[];
    for (const id of ids) expect(() => content(id)).not.toThrow();
  });
  it("scam listings carry no real-world contact or payment details", () => {
    for (const l of J.listings.filter((x) => x.text)) {
      for (const t of Object.values(l.text!)) expect(t).not.toMatch(/@|https?:|www\.|\d{3}[-. ]\d{3}[-. ]\d{4}/);
    }
  });
});

describe("phase 1: search", () => {
  it("at least one scam is detectable via the CMHC benchmark", () => {
    const ls = listingsFor(firstJob, "easy", DEMO_SEED);
    const scams = ls.filter((l) => l.answer === "scam");
    expect(scams.some((l) => (belowBenchmark(l.rentCents, l.benchmarkCents) ?? 0) >= 0.4)).toBe(true);
    expect(scams.every((l) => l.redFlags.includes("scam-below-market"))).toBe(true);
  });
  it("Base shows 3 listings: 2 legit and 1 scam that the CMHC benchmark gives away, for any seed", () => {
    for (const seed of [1, 2, 3, DEMO_SEED, 99]) {
      const ls = listingsFor(firstJob, "easy", seed, MODES.base.listings);
      expect(ls).toHaveLength(3);
      expect(ls.filter((l) => l.answer === "legit")).toHaveLength(2);
      const scam = ls.find((l) => l.answer === "scam")!;
      expect(belowBenchmark(scam.rentCents, scam.benchmarkCents)).toBeGreaterThanOrEqual(0.4);
    }
  });
  it("difficulty changes wording, never the facts", () => {
    const facts = (d: "easy" | "normal" | "hard") =>
      listingsFor(firstJob, d, DEMO_SEED).map(({ id, answer, rentCents, neighbourhoodId, redFlags }) => ({ id, answer, rentCents, neighbourhoodId, redFlags }));
    expect(facts("hard")).toEqual(facts("easy"));
    expect(facts("normal")).toEqual(facts("easy"));
    const texts = (d: "easy" | "hard") => listingsFor(firstJob, d, DEMO_SEED).map((l) => l.text);
    expect(texts("hard")).not.toEqual(texts("easy"));
  });
  it("judges flags fairly", () => {
    expect(judgeListing("scam", "scam")).toBe("correct");
    expect(judgeListing("scam", "suspicious")).toBe("caught");
    expect(judgeListing("scam", "legit")).toBe("missed");
    expect(judgeListing("legit", "scam")).toBe("false-alarm");
    expect(judgeListing("suspicious", "scam")).toBe("correct");
  });
});

describe("phase 2 and 6: question rounds replace damage spotting (PRD v3 Change 2)", () => {
  it("viewing questions have exactly one right answer, short feedback and a sourced teaching point", () => {
    for (const q of J.viewing.questions) {
      expect(q.options.filter((o) => (o as { correct?: boolean }).correct)).toHaveLength(1);
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(() => content(q.contentId)).not.toThrow();
    }
    expect(viewingQuestionsFor(DEMO_SEED, MODES.extended.viewingQuestions)).toHaveLength(MODES.extended.viewingQuestions);
  });
  it("the move-in question has one right answer (photograph everything) and feedback for every option", () => {
    const q = J.moveIn.question;
    expect(q.options.filter((o) => (o as { correct?: boolean }).correct).map((o) => o.id)).toEqual(["photos"]);
    expect(Object.keys(q.feedback).sort()).toEqual(q.options.map((o) => o.id).sort());
  });
  it("no data is left for click-to-find mechanics", () => {
    const j = J as unknown as Record<string, Record<string, unknown>>;
    expect(j.viewing.issues).toBeUndefined();
    expect(j.viewing.seconds).toBeUndefined();
  });
});

describe("phase 7: events", () => {
  it("Base plays one fixed event; Extended draws from the pool without repeats", () => {
    expect(eventsFor(MODES.base.events, DEMO_SEED).map((e) => e.id)).toEqual(["leak"]);
    const ext = eventsFor(MODES.extended.events, DEMO_SEED).map((e) => e.id);
    expect(ext).toHaveLength(MODES.extended.events as number);
    expect(new Set(ext).size).toBe(ext.length);
    expect(eventsFor(MODES.extended.events, DEMO_SEED, ["leak"]).map((e) => e.id)).not.toContain("leak");
  });
  it("the Base event ends differently with and without move-in photos", () => {
    const leak = J.events.find((e) => e.id === "leak")!;
    expect(photoOutcome(leak, true)).toBeTruthy();
    expect(photoOutcome(leak, false)).toBeTruthy();
    expect(photoOutcome(leak, true)).not.toEqual(photoOutcome(leak, false));
  });
  it("every event asks who to contact and which level, with a source", () => {
    for (const e of J.events) {
      expect(e.actions.filter((a) => (a as { best?: boolean }).best)).toHaveLength(1);
      expect(Object.keys(J.levels)).toContain(e.level);
      expect(levelCorrect(e, e.level as never)).toBe(true);
      expect(Object.keys(e.feedback).sort()).toEqual(e.actions.map((a) => a.id).sort());
    }
  });
});

describe("phase 5: lease", () => {
  it("easy and hard show the same clauses and problems in different words", () => {
    const easy = leaseFor("s2-a", DEMO_SEED, 160_000, "easy");
    const hard = leaseFor("s2-a", DEMO_SEED, 160_000, "hard");
    expect(hard.map((c) => [c.id, c.problem])).toEqual(easy.map((c) => [c.id, c.problem]));
    expect(easy.filter((c) => c.problem)).toHaveLength(J.lease.problemsPerLease);
    expect(hard.map((c) => c.text)).not.toEqual(easy.map((c) => c.text));
    expect(easy.find((c) => c.id === "rent")!.text).toContain("$1,600");
  });
});

describe("seeds", () => {
  it("are reproducible, and a new seed changes the run", () => {
    expect(listingsFor(firstJob, "easy", 7).map((l) => l.id)).toEqual(listingsFor(firstJob, "easy", 7).map((l) => l.id));
    const run = (s: number) => JSON.stringify([viewingQuestionsFor(s, 3).map((q) => q.id), eventsFor(3, s).map((e) => e.id), leaseFor("s2-b", s, 1, "easy").map((c) => c.id)]);
    expect(run(7)).toEqual(run(7));
    const differs = [1, 2, 3, 4, 5].some((s) => run(s) !== run(99));
    expect(differs).toBe(true);
  });
});

describe("report card: skill only", () => {
  const base: JourneyResult = { scams: { correct: 1, total: 1 }, unknownCostFound: true, photos: true, events: { best: 1, total: 1, levels: 1 }, receipts: [] };
  const extended: JourneyResult = {
    ...base,
    scams: { correct: 2, total: 2 },
    scamReport: true,
    viewing: { right: 3, total: 3 },
    docs: { good: 3, bad: 0 },
    lease: { spotted: 3, total: 3, falseFlags: 0 },
    events: { best: 3, total: 3, levels: 3 },
    notice: true,
    insured: false,
  };
  it("Base scores only what Base tests, with 'Unknown costs found' and no viewing-issues line", () => {
    const labels = reportCard(base).lines.map((l) => l.label);
    expect(labels).toEqual(["Scams and suspicious listings caught", "Unknown costs found", "Documented the unit at move-in", "Best response to problems", "Right level of government"]);
    expect(labels.join()).not.toMatch(/viewing issues/i);
    expect(reportCard(base).readiness).toBe(100);
  });
  it("Extended covers every phase", () => {
    expect(reportCard(extended).lines.length).toBeGreaterThan(reportCard(base).lines.length);
    expect(reportCard(extended).readiness).toBe(100);
  });
  it("a perfect run scores 100% whether or not you bought insurance", () => {
    expect(reportCard({ ...extended, insured: true }).readiness).toBe(100);
  });
  it("mistakes lower it", () => {
    expect(reportCard({ ...base, photos: false }).readiness).toBeLessThan(100);
    expect(reportCard({ ...extended, scams: { correct: 1, total: 3 }, notice: false }).readiness).toBeLessThan(100);
  });
});

describe("civic questions from the journey", () => {
  it("name the City lever and a measurable outcome, with sources", () => {
    const ev = evidenceFor(162);
    for (const kind of ["heat", "repairs"] as const) {
      const q = buildCityQuestion(kind, ev);
      expect(q.text).toMatch(/311/);
      expect(q.measurableOutcome).toBeTruthy();
      expect(q.citations.length).toBeGreaterThanOrEqual(2);
      expect(q.text.toLowerCase()).not.toMatch(/vote for|endorse|will (lower|reduce|save)/);
    }
  });
  it("only First job runs the journey", () => {
    expect(STAGES.filter((s) => isPlayable(s) && s.journey).map((s) => s.id)).toEqual(["first-job"]);
  });
});
