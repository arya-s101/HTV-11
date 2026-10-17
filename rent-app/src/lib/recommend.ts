// Screens Toronto neighbourhoods against the user's housing cap AND commute limit.
// Pure: takes the source data as an argument so tests can feed fixtures.
import {
  burden,
  formatCents as fmt,
  gap,
  monthlyIncome,
  ttcMonthlyCost,
  verdict,
  TTC_FARE,
  type IncomeInput,
  type MonthlyIncome,
  type TransportCost,
  type Verdict,
} from "./calc";
import { BEDROOMS, type Bedroom, type SourceData } from "./sources";

export interface RecommendInput {
  income: IncomeInput;
  housingCapCents: number;
  bedrooms: Bedroom;
  householdSize: number;
  destinationId: string;
  commuteMode: "transit";
  commuteLimitMinutes: number;
  commuteDaysPerMonth: number;
  otherPaidTripsPerMonth: number;
  preference: "money" | "time";
  /** Separately payable utilities/fees per month if known; null = unknown (never assumed zero). */
  knownMonthlyUtilitiesCents: number | null;
}

export type AreaStatus = "feasible" | "misses-housing" | "misses-commute" | "misses-both" | "unknown";

export interface AreaResult {
  neighbourhoodId: number;
  neighbourhoodName: string;
  rent: {
    benchmarkCents: number | null;
    statistic: "CMHC vacant-unit mean rent, private apartments, October 2025";
    zoneCode: string | null;
    zoneLabel: string | null;
    quality: string | null;
    suppressed: boolean;
    sourceCell: string | null;
    zoneShareOfNeighbourhood: number;
    straddlesZones: boolean;
  };
  commute: { minutesP50: number | null; minutesP25: number | null; minutesP75: number | null };
  housingCostCents: number | null;
  housingCostIncludesUtilities: boolean;
  housingGapCents: number | null;
  commuteGapMinutes: number | null;
  housingVerdict: Verdict;
  commuteVerdict: Verdict;
  rentBurden: number | null;
  shelterBurden: number | null;
  transport: TransportCost;
  housingPlusCommuteCents: number | null;
  status: AreaStatus;
  reasons: string[];
  /** Minimum change to the user's limits that would make this area pass. */
  requiredChange: { housingCapIncreaseCents: number | null; commuteLimitIncreaseMinutes: number | null };
}

export interface RecommendResult {
  input: RecommendInput;
  monthlyIncome: MonthlyIncome;
  destination: { id: string; name: string };
  feasible: AreaResult[];
  nearHousing: AreaResult[];
  nearCommute: AreaResult[];
  missesBoth: AreaResult[];
  unknown: AreaResult[];
  counts: Record<AreaStatus, number>;
  provisional: string[];
  sources: { label: string; detail: string; url?: string }[];
}

export class InputError extends Error {}

const NEAR_LIMIT = 6;

export function validateInput(raw: unknown, data: SourceData): RecommendInput {
  const r = (raw ?? {}) as Record<string, unknown>;
  const inc = (r.income ?? {}) as Record<string, unknown>;
  const int = (v: unknown, name: string, min = 0, max = Number.MAX_SAFE_INTEGER) => {
    if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
      throw new InputError(`${name} must be an integer between ${min} and ${max}`);
    }
    return v;
  };
  if (inc.period !== "annual" && inc.period !== "monthly") throw new InputError("income.period must be annual or monthly");
  if (inc.basis !== "gross" && inc.basis !== "net") throw new InputError("income.basis must be gross or net");
  if (!BEDROOMS.includes(r.bedrooms as Bedroom)) throw new InputError(`bedrooms must be one of ${BEDROOMS.join(", ")}`);
  if (!data.travel.destinations.some((d) => d.id === r.destinationId)) {
    throw new InputError(`destinationId must be one of ${data.travel.destinations.map((d) => d.id).join(", ")}`);
  }
  if (r.commuteMode !== "transit") throw new InputError("commuteMode: only transit (TTC) is modelled");
  if (r.preference !== "money" && r.preference !== "time") throw new InputError("preference must be money or time");
  const util = r.knownMonthlyUtilitiesCents;
  return {
    income: { amountCents: int(inc.amountCents, "income.amountCents"), period: inc.period, basis: inc.basis },
    housingCapCents: int(r.housingCapCents, "housingCapCents", 1),
    bedrooms: r.bedrooms as Bedroom,
    householdSize: int(r.householdSize, "householdSize", 1, 20),
    destinationId: r.destinationId as string,
    commuteMode: "transit",
    commuteLimitMinutes: int(r.commuteLimitMinutes, "commuteLimitMinutes", 1, 240),
    commuteDaysPerMonth: int(r.commuteDaysPerMonth, "commuteDaysPerMonth", 0, 31),
    otherPaidTripsPerMonth: int(r.otherPaidTripsPerMonth ?? 0, "otherPaidTripsPerMonth", 0, 500),
    preference: r.preference,
    knownMonthlyUtilitiesCents: util === null || util === undefined ? null : int(util, "knownMonthlyUtilitiesCents"),
  };
}

export function recommend(input: RecommendInput, data: SourceData): RecommendResult {
  const income = monthlyIncome(input.income);
  const transport = ttcMonthlyCost({
    commuteDaysPerMonth: input.commuteDaysPerMonth,
    otherPaidTripsPerMonth: input.otherPaidTripsPerMonth,
  });
  const zones = new Map(data.cmhc.zones.map((z) => [z.zoneCode, z]));
  const minutes = data.travel.minutes[input.destinationId] ?? {};
  const destination = data.travel.destinations.find((d) => d.id === input.destinationId)!;
  const utilitiesKnown = input.knownMonthlyUtilitiesCents !== null;

  const areas: AreaResult[] = data.neighbourhoods.neighbourhoods.map((nb) => {
    const zone = nb.zoneCode ? zones.get(nb.zoneCode) : undefined;
    const m = zone?.benchmarks[input.bedrooms].vacant;
    const rentCents = m && !m.suppressed ? m.valueCents : null;
    const times = minutes[String(nb.id)] ?? null;
    const p50 = times ? times[1] : null;

    const housingCostCents = rentCents === null ? null : rentCents + (input.knownMonthlyUtilitiesCents ?? 0);
    const housingGapCents = gap(housingCostCents, input.housingCapCents);
    const commuteGapMinutes = gap(p50, input.commuteLimitMinutes);
    const housingVerdict = verdict(housingGapCents);
    const commuteVerdict = verdict(commuteGapMinutes);

    let status: AreaStatus;
    if (housingVerdict === "unknown" || commuteVerdict === "unknown") status = "unknown";
    else if (housingVerdict === "pass" && commuteVerdict === "pass") status = "feasible";
    else if (housingVerdict === "fail" && commuteVerdict === "fail") status = "misses-both";
    else status = housingVerdict === "fail" ? "misses-housing" : "misses-commute";

    const reasons: string[] = [];
    if (rentCents === null) reasons.push(`No published ${input.bedrooms} vacant-unit rent for ${zone?.zoneLabel ?? "this area"} (CMHC suppressed): cannot pass.`);
    if (p50 === null) reasons.push("No scheduled transit time available: cannot pass.");
    if (housingGapCents !== null) {
      reasons.push(
        housingGapCents <= 0
          ? `Housing benchmark is ${fmt(-housingGapCents)} under your cap.`
          : `Housing benchmark is ${fmt(housingGapCents)} over your cap.`,
      );
    }
    if (commuteGapMinutes !== null) {
      reasons.push(
        commuteGapMinutes <= 0
          ? `Commute is ${-commuteGapMinutes} min under your limit.`
          : `Commute is ${commuteGapMinutes} min over your limit.`,
      );
    }

    return {
      neighbourhoodId: nb.id,
      neighbourhoodName: nb.name,
      rent: {
        benchmarkCents: rentCents,
        statistic: "CMHC vacant-unit mean rent, private apartments, October 2025",
        zoneCode: zone?.zoneCode ?? null,
        zoneLabel: zone?.zoneLabel ?? null,
        quality: m?.quality ?? null,
        suppressed: m?.suppressed ?? false,
        sourceCell: m?.cell ?? null,
        zoneShareOfNeighbourhood: nb.zoneShare,
        straddlesZones: nb.straddles,
      },
      commute: { minutesP25: times?.[0] ?? null, minutesP50: p50, minutesP75: times?.[2] ?? null },
      housingCostCents,
      housingCostIncludesUtilities: utilitiesKnown,
      housingGapCents,
      commuteGapMinutes,
      housingVerdict,
      commuteVerdict,
      rentBurden: burden(rentCents, income),
      shelterBurden: utilitiesKnown ? burden(housingCostCents, income) : null,
      transport,
      housingPlusCommuteCents: housingCostCents === null ? null : housingCostCents + transport.cents,
      status,
      reasons,
      requiredChange: {
        housingCapIncreaseCents: housingGapCents === null ? null : Math.max(0, housingGapCents),
        commuteLimitIncreaseMinutes: commuteGapMinutes === null ? null : Math.max(0, commuteGapMinutes),
      },
    };
  });

  const byMoney = (a: AreaResult, b: AreaResult) =>
    a.housingPlusCommuteCents! - b.housingPlusCommuteCents! || a.commute.minutesP50! - b.commute.minutesP50!;
  const byTime = (a: AreaResult, b: AreaResult) =>
    a.commute.minutesP50! - b.commute.minutesP50! || a.housingPlusCommuteCents! - b.housingPlusCommuteCents!;
  const of = (s: AreaStatus) => areas.filter((a) => a.status === s);

  const counts = { feasible: 0, "misses-housing": 0, "misses-commute": 0, "misses-both": 0, unknown: 0 } as Record<AreaStatus, number>;
  for (const a of areas) counts[a.status]++;

  const provisional = [
    "Rent benchmarks are CMHC survey-zone means for October 2025, not this neighbourhood's prices and not proof a unit is available at that price.",
    "Neighbourhood-to-zone assignment uses CMHC's 2026 zone polygons; the 2025 tables use 2021 census zone definitions.",
    utilitiesKnown
      ? "Housing cost adds the utilities/fees you entered. CMHC rents may already include some utilities for some units."
      : "Utilities and fees are unknown and not included; CMHC rents include utilities only where the lease does. Housing cost is rent only.",
    "Commute is scheduled TTC service from one point per neighbourhood, not live conditions or your exact address.",
    `Fares assume an adult PRESTO/contactless payer using one payment method, ${fmt(TTC_FARE.adultFareCents)} per paid trip, ${TTC_FARE.monthlyFareCap}-fare monthly cap (checked ${TTC_FARE.checkedOn}).`,
  ];

  return {
    input,
    monthlyIncome: income,
    destination: { id: destination.id, name: destination.name },
    feasible: of("feasible").sort(input.preference === "money" ? byMoney : byTime),
    nearHousing: of("misses-housing").sort((a, b) => a.housingGapCents! - b.housingGapCents! || byTime(a, b)).slice(0, NEAR_LIMIT),
    nearCommute: of("misses-commute").sort((a, b) => a.commuteGapMinutes! - b.commuteGapMinutes! || byMoney(a, b)).slice(0, NEAR_LIMIT),
    missesBoth: of("misses-both"),
    unknown: of("unknown"),
    counts,
    provisional,
    sources: [
      { label: "CMHC Rental Market Survey, Toronto 2025, Table 1.1.9", detail: "Adapted from CMHC data. CMHC has not endorsed this product.", url: data.cmhc.source.url },
      { label: "City of Toronto Neighbourhoods (158)", detail: "Contains information licensed under the Open Government Licence – Toronto.", url: data.neighbourhoods.source.boundaries.url },
      { label: "TTC GTFS schedules (City of Toronto Open Data)", detail: `Routed with ${data.travel.source.engine}; departures ${data.travel.source.departureWindow.start} + ${data.travel.source.departureWindow.minutes} min.` },
      { label: "OpenStreetMap", detail: "Walking network © OpenStreetMap contributors (ODbL)." },
      { label: "TTC fares", detail: `Checked ${TTC_FARE.checkedOn}`, url: TTC_FARE.url },
    ],
  };
}

