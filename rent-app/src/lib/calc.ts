// Pure, deterministic money/time functions. All money is CAD integer cents.

export type IncomePeriod = "annual" | "monthly";
export type IncomeBasis = "gross" | "net";

export interface IncomeInput {
  amountCents: number;
  period: IncomePeriod;
  basis: IncomeBasis;
}

export interface MonthlyIncome {
  cents: number;
  basis: IncomeBasis;
}

export function monthlyIncome(income: IncomeInput): MonthlyIncome {
  const cents = income.period === "annual" ? Math.round(income.amountCents / 12) : income.amountCents;
  return { cents, basis: income.basis };
}

/** Share of income (0..n). Null when income is zero or missing: never Infinity or NaN. */
export function burden(costCents: number | null, income: MonthlyIncome | null): number | null {
  if (costCents === null || !income || !Number.isFinite(income.cents) || income.cents <= 0) return null;
  return costCents / income.cents;
}

// TTC adult fare, PRESTO / debit / credit (contactless). Checked at https://www.ttc.ca/Fares-and-passes on 2026-10-16.
export const TTC_FARE = {
  adultFareCents: 330,
  transferWindowMinutes: 120,
  monthlyFareCap: 47,
  checkedOn: "2026-10-16",
  url: "https://www.ttc.ca/Fares-and-passes",
} as const;

export interface TransportInput {
  commuteDaysPerMonth: number;
  /** Paid one-way commute trips per commute day. A round trip whose return starts >2h later is 2. */
  paidTripsPerCommuteDay?: number;
  otherPaidTripsPerMonth?: number;
}

export interface TransportCost {
  paidTrips: number;
  chargedFares: number;
  cents: number;
  capReached: boolean;
}

/**
 * Monthly TTC fare under the 47-fare cap. A one-way trip counts as one paid fare however many
 * bus/subway legs it uses, because transfers within two hours are free. Assumes the same payment
 * method every trip (required for the cap).
 */
export function ttcMonthlyCost(input: TransportInput): TransportCost {
  const perDay = input.paidTripsPerCommuteDay ?? 2;
  const paidTrips = Math.max(0, Math.round(input.commuteDaysPerMonth * perDay + (input.otherPaidTripsPerMonth ?? 0)));
  const chargedFares = Math.min(paidTrips, TTC_FARE.monthlyFareCap);
  return {
    paidTrips,
    chargedFares,
    cents: chargedFares * TTC_FARE.adultFareCents,
    capReached: paidTrips >= TTC_FARE.monthlyFareCap,
  };
}

/** Positive = shortfall (over the limit), negative = headroom. Null when either side is unknown. */
export function gap(value: number | null, limit: number): number | null {
  return value === null ? null : value - limit;
}

export type Verdict = "pass" | "fail" | "unknown";

export function verdict(g: number | null): Verdict {
  if (g === null) return "unknown";
  return g <= 0 ? "pass" : "fail";
}

export function formatCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100).toLocaleString("en-CA");
  const rem = abs % 100;
  return `${sign}$${dollars}${rem ? "." + String(rem).padStart(2, "0") : ""}`;
}
