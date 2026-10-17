// Pure, deterministic arithmetic. Money is CAD integer cents. Time is never converted to money.

export function monthlyIncomeCents(income: { amountCents: number; period: "annual" | "monthly" }): number {
  return income.period === "annual" ? Math.round(income.amountCents / 12) : income.amountCents;
}

/** Share of monthly income (0..1). Null for zero or missing income, never Infinity. */
export function burden(costCents: number | null, monthlyIncome: number): number | null {
  if (costCents === null || !Number.isFinite(monthlyIncome) || monthlyIncome <= 0) return null;
  return costCents / monthlyIncome;
}

/** One decimal place percentage, e.g. 0.34909 -> 34.9 */
export function pct1(ratio: number): number {
  return Math.round(ratio * 1000) / 10;
}

export const oneWayTripsPerMonth = (commuteDaysPerMonth: number) => commuteDaysPerMonth * 2;

export function commuteHoursPerMonth(oneWayMinutes: number, trips: number): number {
  return (oneWayMinutes * trips) / 60;
}

export interface FareRule {
  adultFareCents: number;
  monthlyCapPaidTrips: number;
  postSecondaryMonthlyPassCents: number;
}

/**
 * Pay-per-trip TTC cost with the monthly cap. Each one-way journey is one paid trip: transfers within
 * two hours are free, so extra bus legs don't add fares. Requires the same payment method every trip.
 */
export function paygFareCents(trips: number, rule: FareRule): number {
  return Math.min(Math.max(0, trips), rule.monthlyCapPaidTrips) * rule.adultFareCents;
}

export function cheapestFare(trips: number, rule: FareRule, allowPostSecondaryPass: boolean) {
  const payg = paygFareCents(trips, rule);
  const pass = allowPostSecondaryPass ? rule.postSecondaryMonthlyPassCents : null;
  return pass !== null && pass < payg ? { cents: pass, method: "post-secondary-pass" as const, payg, pass } : { cents: payg, method: "adult-payg" as const, payg, pass };
}
