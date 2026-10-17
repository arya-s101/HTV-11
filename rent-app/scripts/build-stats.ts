// Builds data/stats.json: the stat cards shown after answers (PRD v3 Change 4).
// Every figure is REAL and sourced (status "measured" or "derived"); nothing here is illustrative.
// Inputs: data/raw/cmhc-toronto-2025.xlsx, data/raw/nbhd-profiles-2021.xlsx, data/raw/rentsafeto-evaluations.csv,
// data/game/stages.json, data/game/evidence.json, data/game/levers.json, plus a few official figures checked by hand (below).
// Run: npm run build:stats
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

type Status = "measured" | "derived";
interface Field {
  value: number;
  unit: string;
  geography: string;
  reference_period: string;
  source_url: string;
  status: Status;
  source_ref: string;
}
interface StatCard {
  id: string;
  /** The question this card follows. Several cards may share one; a run never repeats a `group`. */
  question_id: string;
  group: string;
  label: string;
  stat: Field;
  stat_label?: string;
  compare_to?: Field;
  compare_label?: string;
  verified_by: string;
}

const CHECKED = "2026-10-17";
const BY = `build-stats script, ${CHECKED}`;
const cards: StatCard[] = [];
const add = (question_ids: string[], c: Omit<StatCard, "id" | "question_id" | "verified_by"> & { verified_by?: string }) => {
  for (const q of question_ids) cards.push({ id: `${q}:${c.group}`, question_id: q, verified_by: BY, ...c });
};

// ---------- CMHC Rental Market Survey, Toronto, October 2025 ----------
const CMHC_FILE = "data/raw/cmhc-toronto-2025.xlsx";
const cmhcSnap = JSON.parse(readFileSync("data/snapshots/cmhc-rents-2025.json", "utf8"));
const CMHC_URL: string = cmhcSnap.source.url;
const wb = XLSX.readFile(CMHC_FILE);
const CITY = "City of Toronto (Zones 1-17)";
/** Finds the City of Toronto row and a header column, returning the number and its exact cell. */
function cmhcCell(sheet: string, header: string, sub: string): { value: number; cell: string } {
  const ws = wb.Sheets[sheet];
  const range = XLSX.utils.decode_range(ws["!ref"]!);
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, blankrows: true });
  const r = rows.findIndex((row) => String(row[0]).trim() === CITY);
  const hRow = rows.findIndex((row) => row.some((v) => v === header));
  if (r < 0 || hRow < 0) throw new Error(`${sheet}: row or header missing`);
  const start = rows[hRow].indexOf(header);
  const c = rows[hRow + 1].findIndex((v, i) => i >= start && String(v).trim() === sub);
  if (c < 0) throw new Error(`${sheet}: ${header}/${sub} missing`);
  const raw = rows[r][c];
  const value = typeof raw === "number" ? raw : Number(String(raw).replace(/,/g, ""));
  if (!Number.isFinite(value)) throw new Error(`${sheet}: not a number at ${header}/${sub}: ${raw}`);
  return { value, cell: `${sheet}!${XLSX.utils.encode_cell({ r: r + range.s.r, c: c + range.s.c })}` };
}
const cmhcField = (sheet: string, header: string, sub: string, unit: string, period: string, what: string, scale = 1): Field => {
  const x = cmhcCell(sheet, header, sub);
  return {
    value: Math.round(x.value * scale * 10) / 10,
    unit,
    geography: "City of Toronto (CMHC zones 1–17), private apartments",
    reference_period: period,
    source_url: CMHC_URL,
    status: "measured",
    source_ref: `${x.cell}; ${what}`,
  };
};

const vac25 = cmhcField("Table 1.1.1", "1 Bedroom", "Oct-25", "%", "October 2025", "1-bedroom vacancy rate");
const vac24 = cmhcField("Table 1.1.1", "1 Bedroom", "Oct-24", "%", "October 2024", "1-bedroom vacancy rate");
const rent25 = cmhcField("Table 1.1.2", "1 Bedroom", "Oct-25", "CAD cents/month", "October 2025", "average 1-bedroom rent, all units", 100);
const rent24 = cmhcField("Table 1.1.2", "1 Bedroom", "Oct-24", "CAD cents/month", "October 2024", "average 1-bedroom rent, all units", 100);
const vacant = cmhcField("Table 1.1.9", "1 Bedroom", "Vacant Units", "CAD cents/month", "October 2025", "average rent of VACANT 1-bedroom units", 100);
const occupied = cmhcField("Table 1.1.9", "1 Bedroom", "Occupied Units", "CAD cents/month", "October 2025", "average rent of OCCUPIED 1-bedroom units", 100);

add(["listing:legit"], { group: "cmhc-rent-change", label: "Average Toronto 1-bed rent, a year apart", stat: rent25, stat_label: "Oct 2025", compare_to: rent24, compare_label: "Oct 2024" });
add(["listing:legit", "verify"], { group: "cmhc-vacant-vs-occupied", label: "New tenants pay more than tenants already living there", stat: vacant, stat_label: "Vacant 1-beds", compare_to: occupied, compare_label: "Occupied 1-beds" });
add(["listing:legit", "apply:rival"], { group: "cmhc-vacancy", label: "Share of Toronto 1-bed apartments sitting empty", stat: vac25, stat_label: "Oct 2025", compare_to: vac24, compare_label: "Oct 2024" });

// ---------- 2021 Neighbourhood Profiles (Census) ----------
const evidence = JSON.parse(readFileSync("data/game/evidence.json", "utf8"));
const PROFILES_URL: string = evidence.sources.profiles.url;
const pw = XLSX.readFile("data/raw/nbhd-profiles-2021.xlsx");
const prow: unknown[][] = XLSX.utils.sheet_to_json(pw.Sheets["hd2021_census_profile"], { header: 1, defval: null });
const ROW_TENANTS = 376;
const ROW_TENANT_30 = 378;
if (!String(prow[ROW_TENANTS - 1][0]).startsWith("Total - Tenant households")) throw new Error("Profiles row 376 label changed");
if (!String(prow[ROW_TENANT_30 - 1][0]).includes("% of tenant households spending 30% or more")) throw new Error("Profiles row 378 label changed");
let tenants = 0;
let burdened = 0;
for (let c = 1; c < prow[0].length; c++) {
  const n = prow[ROW_TENANTS - 1][c];
  const p = prow[ROW_TENANT_30 - 1][c];
  if (typeof n === "number" && typeof p === "number") {
    tenants += n;
    burdened += (n * p) / 100;
  }
}
const cityTenant30: Field = {
  value: Math.round((burdened / tenants) * 1000) / 10,
  unit: "%",
  geography: "City of Toronto (all 158 neighbourhoods combined)",
  reference_period: "2021 Census (incomes refer to 2020)",
  source_url: PROFILES_URL,
  status: "derived",
  source_ref: `Tenant-weighted average of rows ${ROW_TENANT_30} (%) using row ${ROW_TENANTS} (tenant households), sheet hd2021_census_profile`,
};
const stages = JSON.parse(readFileSync("data/game/stages.json", "utf8"));
for (const s of stages.stages)
  for (const o of s.offers ?? []) {
    const nb = evidence.neighbourhoods[o.neighbourhoodId];
    if (nb?.tenantShelter30?.status !== "measured") continue;
    add([`choose:${o.id}`], { group: `tenant30:${o.neighbourhoodId}`, label: "Tenant households spending 30%+ of income on housing", stat: nb.tenantShelter30, stat_label: nb.name, compare_to: cityTenant30, compare_label: "All of Toronto" });
  }

// ---------- RentSafeTO apartment building evaluations (City of Toronto open data) ----------
const RENTSAFE_URL = "https://open.toronto.ca/dataset/apartment-building-evaluation/";
const csv = readFileSync("data/raw/rentsafeto-evaluations.csv", "utf8").trim().split(/\r?\n/);
/** Splits one CSV line, honouring double quotes (addresses can contain commas). */
const splitCsv = (line: string) => {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) (out.push(cur), (cur = ""));
    else cur += ch;
  }
  out.push(cur);
  return out;
};
const head = splitCsv(csv[0]);
const col = (name: string) => {
  const i = head.indexOf(name);
  if (i < 0) throw new Error(`RentSafeTO column ${name} missing`);
  return i;
};
const [iRsn, iDate, iScore, iUnits] = [col("RSN"), col("EVALUATION COMPLETED ON"), col("CURRENT BUILDING EVAL SCORE"), col("CONFIRMED UNITS")];
const latest = new Map<string, string[]>();
for (const line of csv.slice(1)) {
  const f = splitCsv(line);
  const prev = latest.get(f[iRsn]);
  if (!prev || f[iDate] > prev[iDate]) latest.set(f[iRsn], f);
}
const scored = [...latest.values()].filter((f) => f[iScore].trim() !== "");
const dates = scored.map((f) => f[iDate]).sort();
const period = `Latest evaluation per building, ${dates[0].slice(0, 4)}–${dates[dates.length - 1].slice(0, 4)}`;
const units = scored.reduce((a, f) => a + (Number(f[iUnits]) || 0), 0);
const under80 = scored.filter((f) => Number(f[iScore]) < 80).length;
const rentsafe = (value: number, unit: string, status: Status, ref: string): Field => ({ value, unit, geography: "City of Toronto, buildings with 3+ storeys and 10+ units", reference_period: period, source_url: RENTSAFE_URL, status, source_ref: ref });
const repairs = ["event:heat:action", "event:pests:action", "event:leak:action", "event:smoke:action"];
const repairLevels = ["event:heat:level", "event:pests:level", "event:leak:level", "event:smoke:level"];
add(repairs, { group: "rentsafe-units", label: "Rental units in buildings the City inspects (RentSafeTO)", stat: rentsafe(units, "units", "derived", `Sum of CONFIRMED UNITS over ${scored.length} buildings' latest evaluation`) });
add(repairLevels, { group: "rentsafe-under-80", label: "Inspected buildings scoring under 80 out of 100", stat: rentsafe(under80, "buildings", "derived", `Count of latest CURRENT BUILDING EVAL SCORE < 80`), compare_to: rentsafe(scored.length, "buildings", "derived", "Buildings with a latest evaluation score"), compare_label: "All evaluated", stat_label: "Under 80" });

// ---------- TTC fares (levers.json, sourced) ----------
const fares = JSON.parse(readFileSync("data/game/levers.json", "utf8")).fares;
const ttc = (value: number, unit: string, ref: string): Field => ({ value, unit, geography: "TTC (City of Toronto)", reference_period: fares.referencePeriod, source_url: fares.sources[0].url, status: "measured", source_ref: ref });
add(["event:ttc:action"], { group: "ttc-cap", label: "Paid trips a month before TTC rides become free", stat: ttc(fares.monthlyCapPaidTrips, "trips", "Monthly fare cap, same payment method") });
add(["event:ttc:level"], { group: "ttc-fare", label: "Adult TTC fare with PRESTO, debit or credit", stat: ttc(fares.adultFareCents, "CAD cents", "Adult single fare") });

// ---------- Official figures checked by hand on CHECKED ----------
const guideline: Field = { value: 2.1, unit: "%", geography: "Ontario", reference_period: "2026 rent increase guideline", source_url: "https://www.ontario.ca/page/residential-rent-increases", status: "measured", source_ref: "Rent increase guideline for 2026" };
add(["event:rent-increase:action", "lease:rent"], { group: "rent-guideline", label: "Most a rent-controlled rent can rise in 2026", stat: guideline });

const CAFC_URL = "https://antifraudcentre-centreantifraude.ca/features-vedette/2025/02/month-prevention-mois-eng.htm";
const cafc = (value: number, unit: string, ref: string): Field => ({ value, unit, geography: "Canada, all fraud types", reference_period: "2024", source_url: CAFC_URL, status: "measured", source_ref: `${ref} (page modified 2025-03-24)` });
const losses = cafc(638, "CAD millions", '"over $638 million in reported losses"');
const reports = cafc(108878, "reports", '"108,878 fraud reports"');
add(["listing:scam", "listing:suspicious", "scam-report"], { group: "cafc-losses", label: "Reported fraud losses in Canada, all fraud types", stat: losses });
add(["listing:suspicious", "listing:scam", "scam-report"], { group: "cafc-reports", label: "Fraud reports to the Canadian Anti-Fraud Centre", stat: reports });

const LTB_URL = "https://tribunalsontario.ca/documents/TO/Tribunals_Ontario_2024-2025_Annual_Report.html";
add(["movein"], {
  group: "ltb-applications",
  label: "Applications to the Landlord and Tenant Board in one year",
  stat: { value: 87993, unit: "applications", geography: "Ontario", reference_period: "Fiscal 2024–25", source_url: LTB_URL, status: "measured", source_ref: '"the LTB received a total of 87,993 applications"' },
});

// Order matters: a question shows its first card whose group hasn't been shown yet this run.
for (const c of cards) if (c.label.split(/\s+/).length > 12) throw new Error(`Label over 12 words: ${c.label}`);
writeFileSync(
  "data/stats.json",
  JSON.stringify({ _note: "REAL, sourced figures only, generated by scripts/build-stats.ts. Never edit by hand.", checked: CHECKED, cards }, null, 2) + "\n",
);
console.log(`${cards.length} stat cards written; city tenant 30%+ = ${cityTenant30.value}%, RentSafeTO ${scored.length} buildings, ${units} units, ${under80} under 80`);
