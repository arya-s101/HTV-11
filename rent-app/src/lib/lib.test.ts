import { describe, expect, it } from "vitest";
import { burden, gap, monthlyIncome, ttcMonthlyCost, verdict } from "./calc";
import { explain } from "./explain";
import { InputError, recommend, validateInput, type RecommendInput } from "./recommend";
import { latestByBuilding } from "./rentsafe";
import { sources, type SourceData } from "./sources";

const base: RecommendInput = {
  income: { amountCents: 5_500_000, period: "annual", basis: "gross" },
  housingCapCents: 180_000,
  bedrooms: "1br",
  householdSize: 1,
  destinationId: "union",
  commuteMode: "transit",
  commuteLimitMinutes: 45,
  commuteDaysPerMonth: 20,
  otherPaidTripsPerMonth: 0,
  preference: "money",
  knownMonthlyUtilitiesCents: null,
};

describe("income and burden", () => {
  it("divides annual by 12 and keeps the basis label", () => {
    expect(monthlyIncome({ amountCents: 5_500_000, period: "annual", basis: "gross" })).toEqual({ cents: 458_333, basis: "gross" });
    expect(monthlyIncome({ amountCents: 300_000, period: "monthly", basis: "net" })).toEqual({ cents: 300_000, basis: "net" });
  });
  it("returns null, never Infinity, for zero income", () => {
    expect(burden(180_000, { cents: 0, basis: "gross" })).toBeNull();
    expect(burden(null, { cents: 100, basis: "gross" })).toBeNull();
    expect(burden(150_000, { cents: 500_000, basis: "net" })).toBeCloseTo(0.3);
  });
});

describe("TTC fares", () => {
  it("charges one fare per one-way trip regardless of transfers", () => {
    expect(ttcMonthlyCost({ commuteDaysPerMonth: 10 })).toMatchObject({ paidTrips: 20, chargedFares: 20, cents: 6_600 });
  });
  it("stops charging at the 47-fare monthly cap", () => {
    const c = ttcMonthlyCost({ commuteDaysPerMonth: 22, otherPaidTripsPerMonth: 10 });
    expect(c).toMatchObject({ paidTrips: 54, chargedFares: 47, cents: 15_510, capReached: true });
  });
});

describe("gaps", () => {
  it("positive is a shortfall, negative is headroom, null is unknown", () => {
    expect(gap(185_000, 180_000)).toBe(5_000);
    expect(verdict(gap(40, 45))).toBe("pass");
    expect(verdict(gap(null, 45))).toBe("unknown");
  });
});

describe("source snapshots", () => {
  it("has 158 unique integer neighbourhood ids, all assigned to a City zone", () => {
    const nbs = sources.neighbourhoods.neighbourhoods;
    expect(new Set(nbs.map((n) => n.id)).size).toBe(158);
    expect(nbs.every((n) => Number.isInteger(n.id) && n.zoneCode && Number(n.zoneCode) <= 17)).toBe(true);
    expect(Math.max(...nbs.map((n) => n.id))).toBe(174);
  });
  it("keeps CMHC values and suppressed cells as published", () => {
    const z1 = sources.cmhc.zones.find((z) => z.zoneCode === "01")!;
    expect(z1.benchmarks["1br"].vacant).toEqual({ valueCents: 232_100, quality: "a", suppressed: false, cell: "Table 1.1.9!G8" });
    expect(z1.benchmarks["1br"].occupied.valueCents).toBe(203_600);
    const z2 = sources.cmhc.zones.find((z) => z.zoneCode === "02")!;
    expect(z2.benchmarks["3br+"].vacant).toMatchObject({ valueCents: null, suppressed: true });
  });
});

describe("recommend", () => {
  it("never passes an area with a suppressed rent benchmark", () => {
    const r = recommend({ ...base, bedrooms: "3br+", housingCapCents: 1_000_000, commuteLimitMinutes: 240 }, sources);
    const eastYork = [...r.feasible, ...r.unknown].filter((a) => a.rent.zoneCode === "02");
    expect(eastYork.length).toBeGreaterThan(0);
    expect(eastYork.every((a) => a.status === "unknown" && a.rent.benchmarkCents === null)).toBe(true);
  });

  it("treats a missing route as unknown, not a pass", () => {
    const data: SourceData = { ...sources, travel: { ...sources.travel, minutes: { union: {} } } };
    const r = recommend({ ...base, housingCapCents: 1_000_000, commuteLimitMinutes: 240 }, data);
    expect(r.feasible).toHaveLength(0);
    expect(r.counts.unknown).toBe(158);
  });

  it("reports no match and the concession each near match needs", () => {
    const r = recommend({ ...base, housingCapCents: 150_000 }, sources);
    expect(r.feasible).toHaveLength(0);
    for (const a of r.nearHousing) {
      expect(a.commuteVerdict).toBe("pass");
      expect(a.requiredChange.housingCapIncreaseCents).toBe(a.rent.benchmarkCents! - 150_000);
    }
    expect(explain(r)[0]).toMatch(/^No Toronto neighbourhood meets both/);
  });

  it("changes the feasible set when one limit changes", () => {
    const tight = recommend({ ...base, commuteLimitMinutes: 30 }, sources);
    const loose = recommend({ ...base, commuteLimitMinutes: 60 }, sources);
    expect(loose.feasible.length).toBeGreaterThan(tight.feasible.length);
  });

  it("adds known utilities to housing cost and only then reports shelter burden", () => {
    const r = recommend({ ...base, housingCapCents: 1_000_000, commuteLimitMinutes: 240, knownMonthlyUtilitiesCents: 10_000 }, sources);
    const a = r.feasible[0];
    expect(a.housingCostCents).toBe(a.rent.benchmarkCents! + 10_000);
    expect(a.shelterBurden).not.toBeNull();
    const r2 = recommend({ ...base, housingCapCents: 1_000_000, commuteLimitMinutes: 240 }, sources);
    expect(r2.feasible[0].shelterBurden).toBeNull();
  });

  it("orders feasible areas by the stated preference", () => {
    const loose = { ...base, housingCapCents: 1_000_000, commuteLimitMinutes: 240 };
    const t = recommend({ ...loose, preference: "time" }, sources).feasible.map((a) => a.commute.minutesP50!);
    expect(t).toEqual([...t].sort((a, b) => a - b));
    const m = recommend(loose, sources).feasible.map((a) => a.housingPlusCommuteCents!);
    expect(m).toEqual([...m].sort((a, b) => a - b));
  });

  it("rejects invalid input", () => {
    expect(() => validateInput({ ...base, destinationId: "mars" }, sources)).toThrow(InputError);
    expect(() => validateInput({ ...base, housingCapCents: 1800.5 }, sources)).toThrow(InputError);
    expect(validateInput(base, sources)).toEqual(base);
  });
});

describe("RentSafeTO", () => {
  it("keeps the latest evaluation per building with history", () => {
    const m = latestByBuilding([
      { RSN: 4167693, "SITE ADDRESS": "326 AVENUE RD", "EVALUATION COMPLETED ON": "2025-11-27", "CURRENT BUILDING EVAL SCORE": 96 },
      { RSN: "4167693", "SITE ADDRESS": "326 AVENUE RD", "EVALUATION COMPLETED ON": "2023-09-28", "CURRENT BUILDING EVAL SCORE": "91" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get(4167693)!.latest).toEqual({ date: "2025-11-27", score: 96 });
    expect(m.get(4167693)!.history.map((h) => h.score)).toEqual([91, 96]);
  });
});
