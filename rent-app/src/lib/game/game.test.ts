import { describe, expect, it } from "vitest";
import { sources } from "../sources";
import { budgetFromIncome, evaluate, judge, optimalId, POINTS, type Listing, type Scenario } from "./engine";
import { generateRound, isInteresting, publicRound } from "./generate";
import { parseSeedRound } from "./request";

const scenario: Scenario = {
  personName: "Test",
  annualGrossIncomeCents: 8_000_000,
  housingBudgetCents: budgetFromIncome(8_000_000), // $2,000
  bedroomsNeeded: "1br",
  workId: "union",
  workName: "Union Station",
  commuteLimitMinutes: 45,
  commuteDaysPerMonth: 20,
  priority: "money",
};

const listing = (id: string, over: Partial<Listing>): Listing => ({
  id,
  title: `Listing ${id}`,
  neighbourhoodId: 1,
  neighbourhoodName: "X",
  zoneLabel: "Zone 1",
  zoneBenchmarkCents: 200_000,
  bedrooms: "1br",
  rentCents: 180_000,
  utilitiesIncluded: true,
  utilitiesCents: 0,
  commuteMinutes: 30,
  ...over,
});

// A wins on total cost; B has lower rent but utilities make it dearer; C is cheap but too far;
// D is a studio; E is over budget.
const listings = [
  listing("A", { rentCents: 180_000 }),
  listing("B", { rentCents: 170_000, utilitiesIncluded: false, utilitiesCents: 15_000 }),
  listing("C", { rentCents: 150_000, commuteMinutes: 60 }),
  listing("D", { rentCents: 140_000, bedrooms: "studio" }),
  listing("E", { rentCents: 195_000, utilitiesIncluded: false, utilitiesCents: 10_000, commuteMinutes: 20 }),
];

describe("rules", () => {
  it("budget is 30% of gross monthly income, in cents", () => {
    expect(budgetFromIncome(8_000_000)).toBe(200_000);
  });
  it("flags each broken rule and counts utilities toward the budget", () => {
    expect(evaluate(scenario, listings[2]).failures).toEqual(["commute"]);
    expect(evaluate(scenario, listings[3]).failures).toEqual(["bedrooms"]);
    expect(evaluate(scenario, listings[4])).toMatchObject({ failures: ["budget"], housingCents: 205_000, budgetGapCents: 5_000 });
  });
  it("allows more bedrooms than needed", () => {
    expect(evaluate(scenario, listing("F", { bedrooms: "2br" })).valid).toBe(true);
  });
  it("picks the cheapest valid listing on rent + utilities, not headline rent", () => {
    expect(optimalId(scenario, listings)).toBe("A");
  });
  it("picks the fastest valid listing when time is the priority", () => {
    const fast = [...listings, listing("G", { rentCents: 190_000, commuteMinutes: 25 })];
    expect(optimalId({ ...scenario, priority: "time" }, fast)).toBe("G");
  });
});

describe("judge", () => {
  it("awards optimal points plus streak bonus", () => {
    const r = judge(scenario, listings, "A", 2);
    expect(r).toMatchObject({ correct: true, basePoints: POINTS.optimal, streakBonus: 40, points: 140, newStreak: 3 });
    expect(r.whyOptimal.join(" ")).toMatch(/Listing B also passes, but costs \$50\/month more/);
    expect(r.whyOptimal.join(" ")).toMatch(/Listing C has lower rent \(\$1,500\), but the commute is 15 min over the limit/);
  });
  it("gives partial points for a valid non-optimal pick and resets the streak", () => {
    const r = judge(scenario, listings, "B", 3);
    expect(r).toMatchObject({ correct: false, valid: true, points: POINTS.valid, newStreak: 0 });
    expect(r.whyPickWrong[0]).toMatch(/costs \$50\/month more \(\$600\/year\)/);
  });
  it("gives zero and explains each broken rule", () => {
    const r = judge(scenario, listings, "E", 1);
    expect(r.points).toBe(0);
    expect(r.whyPickWrong).toEqual(["Rent $1,950 + $100 utilities = $2,050/month, $50 over the $2,000 budget."]);
  });
});

describe("generator", () => {
  it("is deterministic for a seed and round", () => {
    expect(generateRound("abc", 3, sources)).toEqual(generateRound("abc", 3, sources));
    expect(generateRound("abc", 3, sources)).not.toEqual(generateRound("abc", 4, sources));
  });
  it("always yields an interesting round with a unique optimum across many seeds", () => {
    for (let i = 0; i < 100; i++) {
      for (let round = 1; round <= 5; round++) {
        const g = generateRound(`s${i}`, round, sources);
        expect(g.listings).toHaveLength(6);
        expect(isInteresting(g.scenario, g.listings)).toBe(true);
        expect(optimalId(g.scenario, g.listings)).toBe(g.optimalId);
      }
    }
  });
  it("uses real commute times and keeps rents near the zone benchmark", () => {
    const g = generateRound("real", 1, sources);
    for (const l of g.listings) {
      expect(l.commuteMinutes).toBe(sources.travel.minutes[g.scenario.workId][String(l.neighbourhoodId)]![1]);
      expect(l.rentCents / l.zoneBenchmarkCents).toBeGreaterThan(0.8);
      expect(l.rentCents / l.zoneBenchmarkCents).toBeLessThan(1.17);
    }
  });
  it("never sends the answer to the browser", () => {
    expect(JSON.stringify(publicRound(generateRound("x", 1, sources)))).not.toContain("optimalId");
  });
  it("validates seed and round", () => {
    expect(() => parseSeedRound("../etc", 1)).toThrow();
    expect(() => parseSeedRound("ok", 6)).toThrow();
    expect(parseSeedRound("ok", "2")).toEqual({ seed: "ok", round: 2 });
  });
});
